import { addDays, dayOf, localDay, metrics, type Dataset } from './model';

export type OverviewChartMetric = 'growth' | 'attendance' | 'reports';
export type ChartDisplayMode = 'line' | 'bar';

export interface ChartDayMeta {
  day: string;
  label: string;
  fullDate: string;
}

export interface GrowthDayPoint extends ChartDayMeta {
  cumulativeEnrolled: number;
  newEnrolled: number;
  cumulativeFamilies: number;
  newFamilies: number;
}

export interface GrowthSeriesSummary {
  points: GrowthDayPoint[];
  currentEnrolled: number;
  startEnrolled: number;
  addedInWindow: number;
  growthPercent: number | null;
  totalFamilies: number;
  waitlistCount: number;
  capacity: number | null;
  capacityPercent: number | null;
}

export interface AttendanceDayPoint extends ChartDayMeta {
  attended: number;
  present: number;
  collected: number;
  absent: number;
  pending: number;
  total: number;
  rate: number;
}

export interface AttendanceSeriesSummary {
  points: AttendanceDayPoint[];
  totalAttended: number;
  totalAbsent: number;
  averageRate: number;
}

export interface ReportDayPoint extends ChartDayMeta {
  submitted: number;
  total: number;
  completionRate: number;
}

export interface ReportSeriesSummary {
  points: ReportDayPoint[];
  totalSubmitted: number;
  averageCompletionRate: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDay(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  const zoned = localDay(text);
  if (ISO_DAY.test(zoned)) return zoned;
  const plain = dayOf(text);
  return ISO_DAY.test(plain) ? plain : '';
}

/** Builds a chronological day sequence ending at `endDate` using timezone-safe UTC noon formatting. */
export function buildDayWindow(endDate: string, days: number): ChartDayMeta[] {
  const safeDays = Math.max(1, Math.floor(days));
  return Array.from({ length: safeDays }, (_, index) => {
    const day = addDays(endDate, index - safeDays + 1);
    const parsed = new Date(day + 'T12:00:00Z');
    const label =
      safeDays <= 7
        ? parsed.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
        : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const fullDate = parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return { day, label, fullDate };
  });
}

/**
 * Computes active enrollment and linked-family growth across the selected date window
 * directly from real `children.created_at` and `users.created_at` timestamps.
 */
export function buildEnrollmentGrowthSeries(
  data: Dataset,
  endDate: string,
  days: number,
  group = ''
): GrowthSeriesSummary {
  const windowDays = buildDayWindow(endDate, days);
  const firstDay = windowDays[0].day;

  const activeChildren = (data.children || []).filter(
    (c) => c.enrollment_status === 'active' && (!group || String(c.group_id) === group)
  );
  const waitlistCount = (data.children || []).filter(
    (c) => c.enrollment_status === 'waitlist' && (!group || String(c.group_id) === group)
  ).length;
  const activeParents = (data.users || []).filter(
    (u) => u.role === 'parent' && u.status === 'active'
  );

  let baselineChildren = 0;
  const dailyChildAdds = new Map<string, number>();
  for (const child of activeChildren) {
    const enrolledOn = normalizeDay(child.created_at);
    if (!enrolledOn || enrolledOn < firstDay) {
      baselineChildren += 1;
    } else if (enrolledOn <= endDate) {
      dailyChildAdds.set(enrolledOn, (dailyChildAdds.get(enrolledOn) || 0) + 1);
    }
  }

  let baselineFamilies = 0;
  const dailyFamilyAdds = new Map<string, number>();
  for (const parent of activeParents) {
    const joinedOn = normalizeDay(parent.created_at);
    if (!joinedOn || joinedOn < firstDay) {
      baselineFamilies += 1;
    } else if (joinedOn <= endDate) {
      dailyFamilyAdds.set(joinedOn, (dailyFamilyAdds.get(joinedOn) || 0) + 1);
    }
  }

  let runningChildren = baselineChildren;
  let runningFamilies = baselineFamilies;
  const points: GrowthDayPoint[] = windowDays.map((meta) => {
    const newEnrolled = dailyChildAdds.get(meta.day) || 0;
    const newFamilies = dailyFamilyAdds.get(meta.day) || 0;
    runningChildren += newEnrolled;
    runningFamilies += newFamilies;
    return {
      ...meta,
      cumulativeEnrolled: runningChildren,
      newEnrolled,
      cumulativeFamilies: runningFamilies,
      newFamilies,
    };
  });

  const currentEnrolled = points[points.length - 1]?.cumulativeEnrolled ?? baselineChildren;
  const addedInWindow = currentEnrolled - baselineChildren;
  const growthPercent =
    baselineChildren > 0 ? Math.round((addedInWindow / baselineChildren) * 100) : null;
  const rawMax = Number(data.daycare?.max_children);
  const capacity = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;
  const capacityPercent = capacity ? Math.round((currentEnrolled / capacity) * 100) : null;

  return {
    points,
    currentEnrolled,
    startEnrolled: baselineChildren,
    addedInWindow,
    growthPercent,
    totalFamilies: points[points.length - 1]?.cumulativeFamilies ?? baselineFamilies,
    waitlistCount,
    capacity,
    capacityPercent,
  };
}

/** Computes daily attended vs. absent counts for the selected date window. */
export function buildAttendanceSeries(
  data: Dataset,
  endDate: string,
  days: number,
  group = ''
): AttendanceSeriesSummary {
  const windowDays = buildDayWindow(endDate, days);
  const points: AttendanceDayPoint[] = windowDays.map((meta) => {
    const m = metrics(data, meta.day, group);
    const attended = m.present + m.collected;
    const rate = m.total > 0 ? Math.round((attended / m.total) * 100) : attended > 0 ? 100 : 0;
    return {
      ...meta,
      attended,
      present: m.present,
      collected: m.collected,
      absent: m.absent,
      pending: m.pending,
      total: m.total,
      rate,
    };
  });

  const totalAttended = points.reduce((sum, point) => sum + point.attended, 0);
  const totalAbsent = points.reduce((sum, point) => sum + point.absent, 0);
  const recordedDays = points.filter((point) => point.attended + point.absent > 0);
  const averageRate = recordedDays.length
    ? Math.round(recordedDays.reduce((sum, point) => sum + point.rate, 0) / recordedDays.length)
    : 0;

  return {
    points,
    totalAttended,
    totalAbsent,
    averageRate,
  };
}

/** Computes daily care report submission counts and completion rates over the selected window. */
export function buildReportsSeries(
  data: Dataset,
  endDate: string,
  days: number,
  group = ''
): ReportSeriesSummary {
  const windowDays = buildDayWindow(endDate, days);
  const points: ReportDayPoint[] = windowDays.map((meta) => {
    const m = metrics(data, meta.day, group);
    const completionRate = m.total > 0 ? Math.round((m.submitted / m.total) * 100) : 0;
    return {
      ...meta,
      submitted: m.submitted,
      total: m.total,
      completionRate,
    };
  });

  const totalSubmitted = points.reduce((sum, point) => sum + point.submitted, 0);
  const activeDays = points.filter((point) => point.total > 0);
  const averageCompletionRate = activeDays.length
    ? Math.round(
        activeDays.reduce((sum, point) => sum + point.completionRate, 0) / activeDays.length
      )
    : 0;

  return {
    points,
    totalSubmitted,
    averageCompletionRate,
  };
}

