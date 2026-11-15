import React, { useMemo, useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ScriptableContext,
  type TooltipItem,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import type { Dataset } from './model';
import {
  buildAttendanceSeries,
  buildEnrollmentGrowthSeries,
  buildReportsSeries,
  type ChartDayMeta,
  type ChartDisplayMode,
  type OverviewChartMetric,
} from './portalChartsModel';
import { Button, Icon } from './ui.web';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Filler,
  Tooltip,
  Legend
);

const FONT_REGULAR = 'Quicksand_500Medium, Quicksand, sans-serif';
const FONT_SEMIBOLD = 'Quicksand_600SemiBold, Quicksand, sans-serif';
const FONT_BOLD = 'Quicksand_700Bold, Quicksand, sans-serif';

interface ChartConfigParams {
  points: ChartDayMeta[];
  days: number;
  suggestedMax?: number;
  afterBody?: (index: number) => string[];
}

function areaFill(topColor: string, bottomColor: string) {
  return (context: ScriptableContext<'line'>) => {
    const { chart } = context;
    const { chartArea, ctx } = chart;
    if (!chartArea) return topColor;
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    return gradient;
  };
}

function sharedPlugins<T extends 'line' | 'bar'>(
  points: ChartDayMeta[],
  afterBody?: (index: number) => string[]
) {
  return {
    legend: {
      display: true,
      position: 'bottom' as const,
      align: 'start' as const,
      labels: {
        usePointStyle: true,
        pointStyle: 'circle' as const,
        boxWidth: 8,
        boxHeight: 8,
        padding: 16,
        color: '#475569',
        font: { family: FONT_SEMIBOLD, size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#0f2438',
      titleColor: '#ffffff',
      bodyColor: '#e2e8f0',
      footerColor: '#cbd5e1',
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      boxPadding: 5,
      usePointStyle: true,
      titleFont: { family: FONT_BOLD, size: 13 },
      bodyFont: { family: FONT_REGULAR, size: 12 },
      footerFont: { family: FONT_REGULAR, size: 11 },
      callbacks: {
        title(items: TooltipItem<T>[]) {
          const idx = items[0]?.dataIndex ?? 0;
          return points[idx]?.fullDate || items[0]?.label || '';
        },
        afterBody(items: TooltipItem<T>[]) {
          if (!afterBody || !items.length) return [];
          return afterBody(items[0].dataIndex);
        },
      },
    },
  };
}

function sharedScales(days: number, suggestedMax?: number) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: '#64748b',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: days <= 7 ? 7 : 8,
        font: { family: FONT_SEMIBOLD, size: 11 },
      },
    },
    y: {
      beginAtZero: true,
      suggestedMax,
      border: { display: false },
      grid: { color: '#edf0e9' },
      ticks: {
        precision: 0,
        maxTicksLimit: 5,
        color: '#64748b',
        font: { family: FONT_SEMIBOLD, size: 11 },
      },
    },
  };
}

function buildLineOptions({
  points,
  days,
  suggestedMax,
  afterBody,
}: ChartConfigParams): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 240 },
    plugins: sharedPlugins<'line'>(points, afterBody),
    scales: sharedScales(days, suggestedMax),
  };
}

function buildBarOptions({
  points,
  days,
  suggestedMax,
  afterBody,
}: ChartConfigParams): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 240 },
    plugins: sharedPlugins<'bar'>(points, afterBody),
    scales: sharedScales(days, suggestedMax),
  };
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ChartDisplayMode;
  onChange: (next: ChartDisplayMode) => void;
}) {
  return (
    <div className="p-chart-mode-toggle" role="group" aria-label="Chart display style">
      <button
        type="button"
        className={mode === 'line' ? 'active' : ''}
        aria-pressed={mode === 'line'}
        onClick={() => onChange('line')}
      >
        Trend Line
      </button>
      <button
        type="button"
        className={mode === 'bar' ? 'active' : ''}
        aria-pressed={mode === 'bar'}
        onClick={() => onChange('bar')}
      >
        Daily Bars
      </button>
    </div>
  );
}

function MetricStat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone?: 'green' | 'gold' | 'blue';
}) {
  return (
    <span className={`p-chart-metric-stat${tone ? ` ${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function ChartView({
  mode,
  lineData,
  barData,
  points,
  days,
  lineMax,
  barMax,
  afterBody,
  ariaLabel,
}: {
  mode: ChartDisplayMode;
  lineData: ChartData<'line'>;
  barData: ChartData<'bar'>;
  points: ChartDayMeta[];
  days: number;
  lineMax?: number;
  barMax?: number;
  afterBody?: (index: number) => string[];
  ariaLabel: string;
}) {
  return (
    <div className="p-chart-canvas-wrap" role="img" aria-label={ariaLabel}>
      {mode === 'line' ? (
        <Line
          data={lineData}
          options={buildLineOptions({ points, days, suggestedMax: lineMax, afterBody })}
        />
      ) : (
        <Bar
          data={barData}
          options={buildBarOptions({ points, days, suggestedMax: barMax, afterBody })}
        />
      )}
    </div>
  );
}

/** Shared attendance chart used on both Overview (when toggled) and Care Analytics. */
export function AttendanceChart({
  data,
  date,
  days = 7,
  group = '',
}: {
  data: Dataset;
  date: string;
  days?: number;
  group?: string;
}) {
  const [chartMode, setChartMode] = useState<ChartDisplayMode>('line');
  const summary = useMemo(
    () => buildAttendanceSeries(data, date, days, group),
    [data, date, days, group]
  );

  const labels = summary.points.map((p) => p.label);
  const pointRadius = days <= 14 ? 3.5 : 2;

  const lineData: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: 'Attended',
        data: summary.points.map((p) => p.attended),
        borderColor: '#2d7a58',
        backgroundColor: areaFill('rgba(45, 122, 88, 0.24)', 'rgba(45, 122, 88, 0.02)'),
        fill: true,
        tension: 0.32,
        borderWidth: 2.5,
        pointRadius,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#2d7a58',
        pointBorderWidth: 2,
      },
      {
        label: 'Absent',
        data: summary.points.map((p) => p.absent),
        borderColor: '#e06d53',
        backgroundColor: 'rgba(224, 109, 83, 0.12)',
        borderDash: [5, 4],
        fill: false,
        tension: 0.32,
        borderWidth: 2,
        pointRadius: days <= 14 ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#e06d53',
        pointBorderWidth: 2,
      },
    ],
  };

  const barData: ChartData<'bar'> = {
    labels,
    datasets: [
      {
        label: 'Attended',
        data: summary.points.map((p) => p.attended),
        backgroundColor: '#2d7a58',
        hoverBackgroundColor: '#236548',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 26,
      },
      {
        label: 'Absent',
        data: summary.points.map((p) => p.absent),
        backgroundColor: '#e06d53',
        hoverBackgroundColor: '#c9563c',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 26,
      },
    ],
  };

  const maxAttendance = Math.max(
    4,
    ...summary.points.map((p) => Math.max(p.attended, p.absent))
  );
  const tooltipBreakdown = (index: number) => {
    const point = summary.points[index];
    if (!point) return [];
    return [
      `On-site: ${point.present} · Picked up: ${point.collected}`,
      `Attendance rate: ${point.rate}%`,
    ];
  };

  return (
    <div>
      <div className="p-chart-subbar">
        <div className="p-chart-summary-line">
          <MetricStat value={summary.totalAttended} label="check-ins" tone="green" />
          <MetricStat value={`${summary.averageRate}%`} label="avg rate" tone="blue" />
          {summary.totalAbsent > 0 && (
            <MetricStat value={summary.totalAbsent} label="absent" tone="gold" />
          )}
        </div>
        <ModeToggle mode={chartMode} onChange={setChartMode} />
      </div>

      <ChartView
        mode={chartMode}
        lineData={lineData}
        barData={barData}
        points={summary.points}
        days={days}
        lineMax={maxAttendance}
        barMax={maxAttendance}
        afterBody={tooltipBreakdown}
        ariaLabel={`Daily attendance across ${days} days: ${summary.points
          .map((p) => `${p.day}: ${p.attended} attended, ${p.absent} absent`)
          .join('; ')}`}
      />
    </div>
  );
}

/** Executive dashboard chart with Enrollment growth (default), Attendance, and Daily reports. */
export function CenterOverviewChart({
  data,
  date,
  days,
  onDaysChange,
  go,
}: {
  data: Dataset;
  date: string;
  days: number;
  onDaysChange: (days: number) => void;
  go: (page: string, fragment?: string) => void;
}) {
  const [metric, setMetric] = useState<OverviewChartMetric>('growth');
  const [chartMode, setChartMode] = useState<ChartDisplayMode>('line');

  const growth = useMemo(
    () => buildEnrollmentGrowthSeries(data, date, days),
    [data, date, days]
  );
  const reports = useMemo(
    () => buildReportsSeries(data, date, days),
    [data, date, days]
  );

  const heading =
    metric === 'growth'
      ? {
          title: 'Center growth',
          subtitle: `Last ${days} days · Enrolled children & linked families`,
        }
      : metric === 'attendance'
        ? {
            title: 'Attendance trends',
            subtitle: `Last ${days} days · Daily check-ins & absences`,
          }
        : {
            title: 'Daily care reports',
            subtitle: `Last ${days} days · ${reports.totalSubmitted} reports submitted (${reports.averageCompletionRate}% avg completion)`,
          };

  const growthMax = Math.max(
    4,
    ...growth.points.map((p) => Math.max(p.cumulativeEnrolled, p.cumulativeFamilies))
  );
  const showCapacityLine =
    chartMode === 'line' &&
    growth.capacity !== null &&
    growth.capacity <= Math.max(12, Math.ceil(growthMax * 2.2));

  const growthLabels = growth.points.map((p) => p.label);
  const growthLineData: ChartData<'line'> = {
    labels: growthLabels,
    datasets: [
      {
        label: 'Enrolled children',
        data: growth.points.map((p) => p.cumulativeEnrolled),
        borderColor: '#2d7a58',
        backgroundColor: areaFill('rgba(45, 122, 88, 0.26)', 'rgba(45, 122, 88, 0.02)'),
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: days <= 14 ? 3.5 : 2,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#2d7a58',
        pointBorderWidth: 2,
      },
      {
        label: 'Active parents',
        data: growth.points.map((p) => p.cumulativeFamilies),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderDash: [4, 4],
        fill: false,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#2563eb',
      },
      ...(showCapacityLine
        ? [
            {
              label: `Capacity (${growth.capacity})`,
              data: growth.points.map(() => growth.capacity as number),
              borderColor: '#d97706',
              borderDash: [6, 5],
              fill: false,
              pointRadius: 0,
              pointHoverRadius: 0,
              borderWidth: 1.5,
            },
          ]
        : []),
    ],
  };

  const growthBarData: ChartData<'bar'> = {
    labels: growthLabels,
    datasets: [
      {
        label: 'New children enrolled',
        data: growth.points.map((p) => p.newEnrolled),
        backgroundColor: '#2d7a58',
        hoverBackgroundColor: '#236548',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28,
      },
      {
        label: 'New parents joined',
        data: growth.points.map((p) => p.newFamilies),
        backgroundColor: '#2563eb',
        hoverBackgroundColor: '#1d4ed8',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28,
      },
    ],
  };

  const reportsLabels = reports.points.map((p) => p.label);
  const reportsLineData: ChartData<'line'> = {
    labels: reportsLabels,
    datasets: [
      {
        label: 'Reports submitted',
        data: reports.points.map((p) => p.submitted),
        borderColor: '#4f46e5',
        backgroundColor: areaFill('rgba(79, 70, 229, 0.22)', 'rgba(79, 70, 229, 0.02)'),
        fill: true,
        tension: 0.32,
        borderWidth: 2.5,
        pointRadius: days <= 14 ? 3.5 : 2,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#4f46e5',
        pointBorderWidth: 2,
      },
    ],
  };

  const reportsBarData: ChartData<'bar'> = {
    labels: reportsLabels,
    datasets: [
      {
        label: 'Reports submitted',
        data: reports.points.map((p) => p.submitted),
        backgroundColor: '#4f46e5',
        hoverBackgroundColor: '#4338ca',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28,
      },
    ],
  };

  const growthNewLabel =
    growth.addedInWindow > 0 ? `+${growth.addedInWindow} new` : '0 new in window';
  const growthPctLabel =
    growth.growthPercent !== null && growth.addedInWindow > 0
      ? ` (+${growth.growthPercent}%)`
      : '';
  const reportsMax = Math.max(
    4,
    ...reports.points.map((p) => Math.max(p.submitted, p.total))
  );

  return (
    <div>
      <div className="p-card-head" style={{ alignItems: 'center' }}>
        <div>
          <h2>{heading.title}</h2>
          <p>{heading.subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="p-tabs" style={{ margin: 0, padding: 2 }} role="group" aria-label="Time window">
            {[7, 14, 30].map((n) => (
              <button
                key={n}
                type="button"
                className={days === n ? 'active' : ''}
                aria-pressed={days === n}
                onClick={() => onDaysChange(n)}
                style={{ padding: '4px 10px', fontSize: 13 }}
              >
                {n}D
              </button>
            ))}
          </div>
          <Button variant="quiet" onClick={() => go('analytics')}>
            Analytics <Icon name="arrow" size={14} />
          </Button>
        </div>
      </div>

      <div className="p-chart-controls">
        <div className="p-chart-metric-pills" role="tablist" aria-label="Dashboard chart metric">
          {(
            [
              ['growth', 'Enrollment growth'],
              ['attendance', 'Attendance'],
              ['reports', 'Daily reports'],
            ] as [OverviewChartMetric, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={metric === key}
              className={metric === key ? 'active' : ''}
              onClick={() => setMetric(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {metric !== 'attendance' && (
          <ModeToggle mode={chartMode} onChange={setChartMode} />
        )}
      </div>

      {metric === 'growth' && (
        <>
          <div className="p-chart-summary-line" style={{ marginBottom: 12 }}>
            <MetricStat value={growth.currentEnrolled} label="enrolled" tone="green" />
            <MetricStat
              value={growth.addedInWindow > 0 ? `+${growth.addedInWindow}` : 0}
              label={growth.addedInWindow > 0 ? `new${growthPctLabel}` : 'new in window'}
              tone="blue"
            />
            {growth.capacity !== null && (
              <MetricStat
                value={`${growth.currentEnrolled}/${growth.capacity}`}
                label={`seats (${growth.capacityPercent}%)`}
                tone={
                  growth.capacityPercent !== null && growth.capacityPercent >= 90
                    ? 'gold'
                    : undefined
                }
              />
            )}
            {growth.waitlistCount > 0 && (
              <MetricStat value={growth.waitlistCount} label="waitlist" />
            )}
          </div>

          <ChartView
            mode={chartMode}
            lineData={growthLineData}
            barData={growthBarData}
            points={growth.points}
            days={days}
            lineMax={Math.max(
              4,
              showCapacityLine && growth.capacity
                ? Math.max(growthMax, growth.capacity)
                : growthMax
            )}
            barMax={Math.max(
              2,
              ...growth.points.map((p) => Math.max(p.newEnrolled, p.newFamilies))
            )}
            afterBody={(idx) => {
              const p = growth.points[idx];
              if (!p) return [];
              if (chartMode === 'bar') {
                return [`Total enrolled by this day: ${p.cumulativeEnrolled}`];
              }
              const lines = [`Added on this day: +${p.newEnrolled} children`];
              if (growth.capacity !== null) {
                lines.push(`Center capacity: ${p.cumulativeEnrolled}/${growth.capacity}`);
              }
              return lines;
            }}
            ariaLabel={`Center enrollment growth over ${days} days: currently ${growth.currentEnrolled} active children, ${growthNewLabel}`}
          />
        </>
      )}

      {metric === 'attendance' && (
        <AttendanceChart data={data} date={date} days={days} />
      )}

      {metric === 'reports' && (
        <>
          <div className="p-chart-summary-line" style={{ marginBottom: 12 }}>
            <MetricStat
              value={reports.totalSubmitted}
              label={reports.totalSubmitted === 1 ? 'report' : 'reports'}
              tone="blue"
            />
            <MetricStat
              value={`${reports.averageCompletionRate}%`}
              label="daily completion"
              tone="green"
            />
          </div>

          <ChartView
            mode={chartMode}
            lineData={reportsLineData}
            barData={reportsBarData}
            points={reports.points}
            days={days}
            lineMax={reportsMax}
            barMax={reportsMax}
            afterBody={(idx) => {
              const p = reports.points[idx];
              return p
                ? [`Completion: ${p.submitted} of ${p.total} (${p.completionRate}%)`]
                : [];
            }}
            ariaLabel={`Daily care reports over ${days} days: ${reports.totalSubmitted} submitted`}
          />
        </>
      )}
    </div>
  );
}
