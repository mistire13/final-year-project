'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { emptyDataset } = require('../src/portal/model.ts');

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

const text = (n) => Array.isArray(n)
  ? n.map(text).join('')
  : n && typeof n === 'object'
    ? text(n.props?.children)
    : String(n ?? '');

test('Badge resolves semantic tone aliases and keeps plain dot class names', () => {
  const react = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
  };
  const { Badge } = loadTs('../src/portal/ui.web.tsx', {
    react: { ...react, default: react },
    'motion/react': {
      motion: { button: 'button', div: 'div' },
      useReducedMotion: () => true,
      useAnimate: () => [{ current: null }, () => {}],
    },
  });

  const amberEl = Badge({ value: 'Under Review', tone: 'amber' });
  assert.equal(amberEl.props.className, 'p-badge gold');
  assert.equal(text(amberEl), 'Under Review');

  const successEl = Badge({ value: 'Plus', tone: 'success' });
  assert.equal(successEl.props.className, 'p-badge green');

  const warningEl = Badge({ value: 'blocked', tone: 'warning' });
  assert.equal(warningEl.props.className, 'p-badge gold');

  const dangerEl = Badge({ value: 'failed', tone: 'danger' });
  assert.equal(dangerEl.props.className, 'p-badge red');

  const infoEl = Badge({ value: 'scheduled', tone: 'info' });
  assert.equal(infoEl.props.className, 'p-badge blue');

  const autoEl = Badge({ value: 'approved' });
  assert.equal(autoEl.props.className, 'p-badge green');
  assert.equal(text(autoEl), 'Approved');
});

test('Overview, Children, and Attendance render Allergies & Dietary as wrapped care-list items instead of Badges', () => {
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
  };

  const Table = function Table({ rows, columns }) {
    return {
      type: 'MockTable',
      props: {
        children: rows.map((row) =>
          columns.map((col) => (col.render ? col.render(row) : row[col.key]))
        ),
      },
    };
  };

  const pages = loadTs('../src/portal/pages.web.tsx', {
    react: { ...react, default: react },
    './MessageOversight.web': { MessageOversight: 'MessageOversight' },
    '../types/daycarePayments': { paymentProvenanceLabel: (v) => String(v || '') },
    './ui.web': { Badge: 'Badge', Button: 'Button', Card: 'Card', Empty: 'Empty', Icon: 'Icon', Person: 'Person', Table },
    './PortalCharts.web': { AttendanceChart: 'AttendanceChart', CenterOverviewChart: 'CenterOverviewChart' },
    './auditUtils': { formatTargetEntity: () => '', formatAuditDetails: () => '' },
  });

  const data = {
    ...emptyDataset(),
    groups: [{ id: 1, name: 'Sunbeams' }],
    users: [{ id: 2, name: 'Hanna', role: 'caregiver', status: 'active' }],
    children: [
      {
        id: 10,
        full_name: 'Lia Abebe',
        dob: '2023-04-01',
        group_id: 1,
        caregiver_id: 2,
        enrollment_status: 'active',
        care_instructions: [
          { id: 1, category: 'allergy', instruction_text: 'No peanuts, tree nuts, or sesame seeds in snacks' },
          { id: 2, category: 'dietary', instruction_text: 'Warm milk only before afternoon nap' },
          { id: 3, category: 'medical_note', instruction_text: 'Keep spacer and inhaler in cubby' },
        ],
      },
      {
        id: 11,
        full_name: 'Dawit Tadesse',
        dob: '2023-07-10',
        group_id: 1,
        caregiver_id: 2,
        enrollment_status: 'active',
        care_instructions: [],
      },
    ],
  };

  const ctx = {
    data,
    date: '2026-11-11',
    query: '',
    staff: false,
    actor: { id: 1, role: 'admin' },
    preview: true,
    go: () => {},
    open: () => {},
  };

  for (const [label, fn] of [
    ['Overview', pages.Overview],
    ['Children', pages.Children],
    ['Attendance', pages.Attendance],
  ]) {
    cursor = 0;
    slots.length = 0;
    const tree = resolve(fn(ctx));
    const careLists = nodes(tree).filter((n) => n.props?.className === 'p-care-list');
    assert.equal(careLists.length, 1, `${label} should render one wrapped care-list for Lia`);
    const careItems = nodes(careLists[0]).filter((n) => String(n.props?.className || '').split(/\s+/).includes('p-care-item'));
    assert.equal(careItems.length, 3, `${label} should render all 3 care instructions separately`);
    assert.equal(nodes(careLists[0]).filter((n) => n.type === 'Badge').length, 0, `${label} allergy cell must not wrap items in Badge pills`);
    assert.ok(careItems.some((n) => n.props.className.includes('is-allergy')));
    assert.ok(careItems.some((n) => n.props.className.includes('is-dietary')));
    assert.ok(careItems.some((n) => n.props.className.includes('is-medical')));
    assert.ok(nodes(tree).some((n) => n.props?.className === 'p-care-none'), `${label} should render quiet text for Dawit`);
  }
});

test('portal.css disables pill borders/capitalize on .p-badge and enables wrapping on .p-care-list', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/portal/portal.css'), 'utf8');
  const badgeBlockMatch = css.match(/\.p-badge\s*\{[\s\S]*?\}/);
  assert.ok(badgeBlockMatch, '.p-badge rule must exist');
  const badgeBlock = badgeBlockMatch[0];
  assert.doesNotMatch(badgeBlock, /border-radius:\s*var\(--radius-full\)/);
  assert.doesNotMatch(badgeBlock, /text-transform:\s*capitalize/);
  assert.match(badgeBlock, /background:\s*transparent/);

  const careListMatch = css.match(/\.p-care-list\s*\{[\s\S]*?\}/);
  assert.ok(careListMatch, '.p-care-list rule must exist');
  assert.match(careListMatch[0], /white-space:\s*normal/);
  assert.match(careListMatch[0], /flex-wrap:\s*wrap/);

  const careItemMatch = css.match(/\.p-care-item\s*\{[\s\S]*?\}/);
  assert.ok(careItemMatch, '.p-care-item rule must exist');
  assert.match(careItemMatch[0], /white-space:\s*normal/);
  assert.match(careItemMatch[0], /overflow-wrap:\s*anywhere/);
});
