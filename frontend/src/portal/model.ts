export type Row = { id: number; [key: string]: any };
export type Dataset = {
  daycare?: Row | null;
  users: Row[];
  children: Row[];
  groups: Row[];
  duties: Row[];
  attendance: Row[];
  reports: Row[];
  health: Row[];
  guardians: Row[];
  guardianRequests?: Row[];
  events: Row[];
  announcements: Row[];
  products: Row[];
  orders: Row[];
  audit: Row[];
  verifications: Row[];
  messages: Row[];
};
export const emptyDataset = (): Dataset => ({ daycare: null, users: [], children: [], groups: [], duties: [], attendance: [], reports: [], health: [], guardians: [], events: [], announcements: [], products: [], orders: [], audit: [], verifications: [], messages: [] });
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dayOf = (value: string) => value?.slice(0, 10) || "";
export const addDays = (date: string, amount: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
export const money = (value: number | string) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  ) + " ETB";
export const label = (value: unknown) =>
  String(value ?? "—")
    .replaceAll("_", " ")
    .replace(/^\w/, (c) => c.toUpperCase());
export const initials = (name: string) =>
  name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
export const localDay = (timestamp: string) =>
  timestamp
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Addis_Ababa",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(timestamp))
    : "";
export const localTime = (timestamp: string) =>
  timestamp
    ? new Date(timestamp).toLocaleTimeString("en", {
        timeZone: "Africa/Addis_Ababa",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export function attendanceStatus(data: Dataset, childId: number, date: string) {
  return data.attendance
    .filter((a) => a.child_id === childId && localDay(a.event_time) === date)
    .sort(
      (a, b) =>
        Date.parse(b.event_time) - Date.parse(a.event_time) || b.id - a.id,
    )[0];
}
export function metrics(data: Dataset, date: string, group = "") {
  const children = data.children.filter(
    (c) =>
      c.enrollment_status === "active" &&
      (!group || String(c.group_id) === group),
  );
  const rows = children.map((child) => ({
    child,
    status: attendanceStatus(data, child.id, date),
  }));
  const count = (status: string) =>
    rows.filter((r) => r.status?.event_type === status).length;
  const submitted = children.filter((c) =>
    data.reports.some(
      (r) => r.child_id === c.id && dayOf(r.report_date) === date,
    ),
  ).length;
  return {
    total: children.length,
    present: count("checkin"),
    collected: count("checkout"),
    absent: count("absent"),
    pending: rows.filter((r) => !r.status).length,
    submitted,
    missing: Math.max(0, children.length - submitted),
    rows,
  };
}
export function dutyState(duty: Row, now = new Date()) {
  if (duty.status === "revoked") return "revoked";
  if (now.getTime() < Date.parse(duty.starts_at)) return "scheduled";
  if (now.getTime() >= Date.parse(duty.ends_at)) return "ended";
  return "on_duty";
}
export function allowedDuty(
  duties: Row[],
  staffId: number,
  groupId: number,
  action: "attendance" | "pickup",
  now = new Date(),
) {
  return duties.some(
    (d) =>
      d.staff_id === staffId &&
      dutyState(d, now) === "on_duty" &&
      (!d.group_id || d.group_id === groupId) &&
      d["can_" + action],
  );
}
export function dutyError(
  staff: Row | undefined,
  start: string,
  end: string,
  duties: Row[],
) {
  if (!staff || staff.role !== "caregiver" || staff.status !== "active")
    return "Choose an active caregiver.";
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    return "End time must be after the start time.";
  if (Date.parse(end) - Date.parse(start) > 16 * 3600000)
    return "A shift can be at most 16 hours.";
  if (
    duties.some(
      (d) =>
        d.staff_id === staff.id &&
        d.status !== "revoked" &&
        Date.parse(start) < Date.parse(d.ends_at) &&
        Date.parse(end) > Date.parse(d.starts_at),
    )
  )
    return "This caregiver already has an overlapping shift.";
  return "";
}
export function exportCsv(headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return (
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'
    );
  };
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
export function makePreview(date = today()): Dataset {
  const names = [
    "Liya Hana",
    "Noah Abel",
    "Hana Samuel",
    "Elias Dawit",
    "Ruth Daniel",
    "Yonas Biruk",
    "Sara Nathan",
    "Kaleb Tesfaye",
    "Mahi Solomon",
    "Aaron Elias",
    "Luna Aman",
    "Abel Yosef",
    "Saron Fitsum",
    "Dani Biniam",
    "Nati Henok",
    "Mila Nahom",
    "Yared Tomas",
    "Lidiya Fikru",
    "Amanuel Robel",
    "Nardos Girma",
    "Meklit Dawit",
    "Samuel Getachew",
    "Naomi Daniel",
    "Bereket Abebe",
  ];
  const caregivers = [
    "Sara Bekele",
    "Meron Alemu",
    "Rahel Tesfaye",
    "Dawit Mekonnen",
    "Selam Girma",
    "Tigist Abebe",
  ];
  const groups = [
    { id: 1, name: "Sunflower", description: "Curious minds, ages 3–4" },
    { id: 2, name: "Little Stars", description: "Growing together, ages 2–3" },
    { id: 3, name: "Rainbow", description: "Ready for discovery, ages 4–5" },
  ];
  const users: Row[] = [
    {
      id: 1,
      name: "Aster Alemayehu",
      email: "admin@example.com",
      role: "admin",
      status: "active",
    },
    ...caregivers.map((name, i) => ({
      id: 10 + i,
      name,
      email: "caregiver" + (i + 1) + "@example.com",
      role: "caregiver",
      status: "active",
    })),
    ...names.map((name, i) => ({
      id: 100 + i,
      name: name.split(" ")[1] + " Tesfaye",
      email: "parent" + (i + 1) + "@example.com",
      role: "parent",
      status: "active",
    })),
  ];
  const children = names.map((name, i) => ({
    id: i + 1,
    full_name: name,
    dob: "2022-" + String((i % 9) + 1).padStart(2, "0") + "-12",
    gender: i % 2 ? "male" : "female",
    enrollment_status: i === 23 ? "waitlist" : "active",
    group_id: (i % 3) + 1,
    caregiver_id: 10 + (i % 6),
    created_at: addDays(date, -90) + "T08:00:00+03:00",
  }));
  const attendance: Row[] = [],
    reports: Row[] = [];
  for (let d = 29; d >= 0; d--) {
    const day = addDays(date, -d);
    children
      .filter((c) => c.enrollment_status === "active")
      .forEach((c, i) => {
        if ((i + d) % 11 === 0) return;
        const absent = (i + d) % 9 === 0;
        attendance.push({
          id: attendance.length + 1,
          child_id: c.id,
          recorded_by: c.caregiver_id,
          event_type: absent ? "absent" : "checkin",
          event_time:
            day + "T08:" + String(i % 50).padStart(2, "0") + ":00+03:00",
        });
        if (!absent && (d > 0 || i % 5 === 0))
          attendance.push({
            id: attendance.length + 1,
            child_id: c.id,
            recorded_by: 10,
            event_type: "checkout",
            event_time: day + "T16:10:00+03:00",
          });
        if (!absent && (d > 0 || i % 4 !== 0))
          reports.push({
            id: reports.length + 1,
            child_id: c.id,
            caregiver_id: c.caregiver_id,
            report_date: day,
            mood: i % 2 ? "happy" : "calm",
            sleep_duration_min: 75,
            general_observations: "Enjoyed group activities and story time.",
          });
      });
  }
  const guardians = children.map((c, i) => ({
    id: i + 1,
    child_id: c.id,
    user_id: 100 + i,
    relationship: i % 2 ? "Father" : "Mother",
    pickup_authorized: true,
    enrolled: i % 4 !== 0,
  }));
  return {
    users,
    children,
    groups,
    attendance,
    reports,
    guardians,
    duties: [
      {
        id: 1,
        staff_id: 10,
        group_id: null,
        starts_at: date + "T07:00:00+03:00",
        ends_at: date + "T13:00:00+03:00",
        can_attendance: true,
        can_pickup: true,
        status: "active",
      },
      {
        id: 2,
        staff_id: 11,
        group_id: null,
        starts_at: date + "T00:00:00+03:00",
        ends_at: date + "T23:59:59+03:00",
        can_attendance: true,
        can_pickup: true,
        status: "active",
      },
    ],
    health: [
      {
        id: 1,
        child_id: 2,
        record_type: "incident",
        severity: "low",
        description: "Small scrape during outdoor play. Cleaned and comforted.",
        parent_notified: false,
        recorded_at: date + "T10:20:00+03:00",
      },
      {
        id: 2,
        child_id: 5,
        record_type: "health",
        severity: "low",
        description: "Rested after lunch; caregiver is monitoring comfort.",
        parent_notified: true,
        recorded_at: date + "T12:30:00+03:00",
      },
    ],
    events: [
      {
        id: 1,
        title: "Parent afternoon",
        event_date: addDays(date, 3),
        event_time: "15:00",
        event_type: "meeting",
        description: "Meet the caregivers and explore this month’s learning.",
        cancelled: false,
      },
      {
        id: 2,
        title: "Little artists day",
        event_date: addDays(date, 6),
        event_time: "10:00",
        event_type: "activity_day",
        description: "A morning of color, creativity and discovery.",
        cancelled: false,
      },
    ],
    announcements: [
      {
        id: 1,
        title: "A new month of little discoveries",
        body: "Our groups are exploring colors, nature and kindness this month.",
        audience: "all",
        announcement_type: "general",
        created_at: date + "T08:00:00+03:00",
      },
    ],
    products: [
      {
        id: 1,
        name: "Exercise Book",
        price: 120,
        stock_qty: 28,
        available: true,
      },
      {
        id: 2,
        name: "Color Pencils",
        price: 180,
        stock_qty: 4,
        available: true,
      },
      {
        id: 3,
        name: "Daycare Uniform",
        price: 650,
        stock_qty: 12,
        available: true,
      },
      { id: 4, name: "Napkins", price: 150, stock_qty: 0, available: false },
    ],
    orders: [
      {
        id: 101,
        parent_id: 100,
        total: 480,
        order_status: "placed",
        payment_status: "unpaid",
        created_at: date + "T09:00:00+03:00",
      },
      {
        id: 102,
        parent_id: 101,
        total: 650,
        order_status: "ready_for_pickup",
        payment_status: "paid",
        created_at: date + "T10:00:00+03:00",
      },
      {
        id: 103,
        parent_id: 103,
        total: 300,
        order_status: "confirmed",
        payment_status: "paid",
        created_at: addDays(date, -2) + "T10:00:00+03:00",
      },
    ],
    audit: [
      {
        id: 1,
        actor_id: 1,
        action: "FRONT_DESK_ASSIGNED",
        target_table: "front_desk_assignments",
        target_id: 2,
        created_at: date + "T07:10:00+03:00",
      },
      {
        id: 2,
        actor_id: 10,
        action: "ATTENDANCE_RECORDED",
        target_table: "attendance",
        target_id: 2,
        created_at: date + "T08:10:00+03:00",
      },
    ],
    verifications: [
      {
        id: 1,
        child_id: 1,
        guardian_user_id: 100,
        verified_by: 10,
        result: "manual_fallback",
        method: "manual",
        verified_at: date + "T16:10:00+03:00",
      },
    ],
    messages: [],
  };
}

// Classroom assignment permits attendance, but never grants pickup permission.
export function allowedAttendance(duties: Row[], actor: Row, child: Row, now = new Date()): boolean {
  if (actor.status && actor.status !== "active") return false;
  if (actor.daycare_id && child.daycare_id && actor.daycare_id !== child.daycare_id) return false;
  return actor.role === "admin" || (actor.role === "caregiver" && (
    child.caregiver_id === actor.id || allowedDuty(duties, actor.id, child.group_id, "attendance", now)
  ));
}
