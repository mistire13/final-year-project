'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { emptyDataset, makePreview } = require('../src/portal/model.ts');

function loadTs(relPath, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, relPath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(compiled, {
    module: m,
    exports: m.exports,
    require(name) {
      if (name in stubs) return stubs[name];
      if (name === './model') return require('../src/portal/model.ts');
      throw new Error(`Unexpected import in ${relPath}: ${name}`);
    },
  });
  return m.exports;
}

const {
  buildDayWindow,
  buildEnrollmentGrowthSeries,
  buildAttendanceSeries,
  buildReportsSeries,
} = loadTs('../src/portal/portalChartsModel.ts');

test('buildDayWindow formats clean labels without weekday/day option clashes', () => {
  const week = buildDayWindow('2026-11-11', 7);
  assert.equal(week.length, 7);
  assert.equal(week[0].day, '2026-11-05');
  assert.equal(week[6].day, '2026-11-11');
  assert.equal(week[6].label, 'Wed');

  const month = buildDayWindow('2026-11-11', 30);
  assert.equal(month.length, 30);
  assert.equal(month[29].label, 'Nov 11');
  assert.match(month[29].fullDate, /Nov 11/);
});

test('buildEnrollmentGrowthSeries computes cumulative enrollments, deltas, and capacity accurately', () => {
  const data = emptyDataset();
  data.daycare = { id: 1, name: 'Ankelba Care', max_children: 10 };
  data.children = [
    { id: 1, full_name: 'Child A', enrollment_status: 'active', created_at: '2026-10-10T09:00:00+03:00' },
    { id: 2, full_name: 'Child B', enrollment_status: 'active', created_at: '2026-11-06T09:00:00+03:00' },
    { id: 3, full_name: 'Child C', enrollment_status: 'active', created_at: '2026-11-10T09:00:00+03:00' },
    { id: 4, full_name: 'Child D', enrollment_status: 'waitlist', created_at: '2026-11-10T09:00:00+03:00' },
    { id: 5, full_name: 'Future Child', enrollment_status: 'active', created_at: '2026-11-15T09:00:00+03:00' },
  ];
  data.users = [
    { id: 10, role: 'parent', status: 'active', created_at: '2026-10-10T09:00:00+03:00' },
    { id: 11, role: 'parent', status: 'active', created_at: '2026-11-10T09:00:00+03:00' },
  ];

  const growth = buildEnrollmentGrowthSeries(data, '2026-11-11', 7);
  assert.equal(growth.startEnrolled, 1);
  assert.equal(growth.currentEnrolled, 3);
  assert.equal(growth.addedInWindow, 2);
  assert.equal(growth.growthPercent, 200);
  assert.equal(growth.waitlistCount, 1);
  assert.equal(growth.totalFamilies, 2);
  assert.equal(growth.capacity, 10);
  assert.equal(growth.capacityPercent, 30);

  const nov6 = growth.points.find((p) => p.day === '2026-11-06');
  const nov10 = growth.points.find((p) => p.day === '2026-11-10');
  assert.equal(nov6.cumulativeEnrolled, 2);
  assert.equal(nov6.newEnrolled, 1);
  assert.equal(nov10.cumulativeEnrolled, 3);
  assert.equal(nov10.newFamilies, 1);
});

test('makePreview shows non-flat enrollment growth over 30 days', () => {
  const preview = makePreview('2026-11-11');
  const growth = buildEnrollmentGrowthSeries(preview, '2026-11-11', 30);
  assert.equal(growth.currentEnrolled, 23);
  assert.ok(growth.addedInWindow > 0);
  assert.equal(growth.waitlistCount, 1);
});

test('buildAttendanceSeries and buildReportsSeries compute accurate daily and summary values', () => {
  const preview = makePreview('2026-11-11');
  const att = buildAttendanceSeries(preview, '2026-11-11', 7);
  assert.equal(att.points.length, 7);
  assert.ok(att.totalAttended > 0);
  assert.ok(att.averageRate >= 0 && att.averageRate <= 100);

  const rep = buildReportsSeries(preview, '2026-11-11', 7);
  assert.equal(rep.points.length, 7);
  assert.ok(rep.totalSubmitted > 0);
  assert.ok(rep.averageCompletionRate >= 0 && rep.averageCompletionRate <= 100);
});

test('CenterOverviewChart renders Enrollment growth by default with Chart.js Line and switches cleanly to Attendance and Daily Bars', () => {
  const slots = [];
  let cursor = 0;
  const react = {
    Fragment: Symbol('fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useMemo(factory) {
      return factory();
    },
  };
  const mExports = loadTs('../src/portal/PortalCharts.web.tsx', {
    react: { ...react, default: react },
    'chart.js': { Chart: { register() {} }, CategoryScale: {}, LinearScale: {}, PointElement: {}, LineElement: {}, BarElement: {}, LineController: {}, BarController: {}, Filler: {}, Tooltip: {}, Legend: {} },
    'react-chartjs-2': { Line: 'ChartLine', Bar: 'ChartBar' },
    './portalChartsModel': loadTs('../src/portal/portalChartsModel.ts'),
    './ui.web': { Button: 'Button', Icon: 'Icon' },
  });

  const resolve = (n) => {
    if (!n || typeof n !== 'object') return n;
    if (Array.isArray(n)) return n.map(resolve);
    if (typeof n.type === 'function') return resolve(n.type(n.props));
    return { ...n, props: { ...n.props, children: resolve(n.props?.children) } };
  };
  const nodes = (n, acc = []) => {
    if (!n || typeof n !== 'object') return acc;
    if (Array.isArray(n)) { n.forEach((x) => nodes(x, acc)); return acc; }
    acc.push(n);
    nodes(n.props?.children, acc);
    return acc;
  };
  const text = (n) => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');

  const preview = makePreview('2026-11-11');
  const { CenterOverviewChart } = mExports;
  const render = () => {
    cursor = 0;
    return resolve(CenterOverviewChart({ data: preview, date: '2026-11-11', days: 30, onDaysChange: () => {}, go: () => {} }));
  };

  let tree = render();
  assert.match(text(tree), /Center growth/);
  assert.match(text(tree), /enrolled/);
  assert.equal(nodes(tree).filter((n) => n.props?.className === 'p-chart-summary-pills').length, 0);
  assert.ok(nodes(tree).some((n) => n.props?.className === 'p-chart-summary-line'));
  let lineChart = nodes(tree).find((n) => n.type === 'ChartLine');
  assert.ok(lineChart);
  assert.equal(lineChart.props.data.datasets[0].label, 'Enrolled children');
  assert.equal(lineChart.props.options.scales.y.ticks.precision, 0);

  // Switch to Daily Bars for Growth
  const barsBtn = nodes(tree).find((n) => n.type === 'button' && text(n) === 'Daily Bars');
  barsBtn.props.onClick();
  tree = render();
  let barChart = nodes(tree).find((n) => n.type === 'ChartBar');
  assert.ok(barChart);
  assert.equal(barChart.props.data.datasets[0].label, 'New children enrolled');

  // Switch metric tab to Attendance
  const attTab = nodes(tree).find((n) => n.type === 'button' && text(n) === 'Attendance');
  attTab.props.onClick();
  tree = render();
  assert.match(text(tree), /Attendance trends/);
  assert.match(text(tree), /check-ins/);
  assert.match(text(tree), /avg rate/);
  const attLine = nodes(tree).find((n) => n.type === 'ChartLine');
  assert.ok(attLine);
  assert.deepEqual(
    Array.from(attLine.props.data.datasets, (d) => d.label),
    ['Attended', 'Absent']
  );

  // Switch metric tab to Daily reports (preserves Daily Bars selection, then toggles back to Trend Line)
  const reportsTab = nodes(tree).find((n) => n.type === 'button' && text(n) === 'Daily reports');
  reportsTab.props.onClick();
  tree = render();
  assert.match(text(tree), /Daily care reports/);
  assert.match(text(tree), /daily completion/);
  const reportsBar = nodes(tree).find((n) => n.type === 'ChartBar');
  assert.ok(reportsBar);
  assert.deepEqual(
    Array.from(reportsBar.props.data.datasets, (d) => d.label),
    ['Reports submitted']
  );

  const trendBtn = nodes(tree).find((n) => n.type === 'button' && text(n) === 'Trend Line');
  trendBtn.props.onClick();
  tree = render();
  const reportsLine = nodes(tree).find((n) => n.type === 'ChartLine');
  assert.ok(reportsLine);
  assert.deepEqual(
    Array.from(reportsLine.props.data.datasets, (d) => d.label),
    ['Reports submitted']
  );
});
