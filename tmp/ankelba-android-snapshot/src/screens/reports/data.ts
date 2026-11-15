// Fixed sample dates keep the design preview reproducible until API integration.
export const previewToday = "2026-08-25";
export type ActivityKind =
  "arrival" | "departure" | "meal" | "learning" | "play" | "sleep" | "art";
export type ReportActivity = {
  time: string;
  title: string;
  note: string;
  kind: ActivityKind;
};
type PreviewReport = {
  id: number;
  date: string;
  isoDate: string;
  mood: string;
  summary: string;
  present: boolean;
  checkIn: string;
  checkOut: string | null;
  activities: ReportActivity[];
  caregiverNote: string;
};
export const reports: PreviewReport[] = [
  {
    id: 1,
    date: "Tue, Aug 25",
    isoDate: previewToday,
    mood: "Happy",
    summary: "Meals, learning, outdoor play, a nap, and painting.",
    present: true,
    checkIn: "8:04 AM",
    checkOut: null,
    activities: [
      {
        time: "8:04 AM",
        title: "Check In",
        note: "Liya arrived at daycare.",
        kind: "arrival",
      },
      {
        time: "9:00 AM",
        title: "Breakfast",
        note: "Ate most of her meal.",
        kind: "meal",
      },
      {
        time: "10:15 AM",
        title: "Learning Activity",
        note: "Colors & Shapes — joined group learning.",
        kind: "learning",
      },
      {
        time: "11:00 AM",
        title: "Play Time",
        note: "Outdoor play with friends.",
        kind: "play",
      },
      {
        time: "12:15 PM",
        title: "Lunch",
        note: "Finished most of her meal.",
        kind: "meal",
      },
      {
        time: "1:00–2:15 PM",
        title: "Nap",
        note: "1 hour 15 minutes of rest.",
        kind: "sleep",
      },
      {
        time: "2:30 PM",
        title: "Art Activity",
        note: "Enjoyed colorful finger paints.",
        kind: "art",
      },
    ],
    caregiverNote:
      "Liya joined the learning and painting activities and played well with her classmates.",
  },
  {
    id: 2,
    date: "Mon, Aug 24",
    isoDate: "2026-08-24",
    mood: "Calm",
    summary: "Story time, building blocks, and a restful afternoon.",
    present: true,
    checkIn: "8:12 AM",
    checkOut: "4:20 PM",
    activities: [
      {
        time: "8:12 AM",
        title: "Check In",
        note: "Liya settled into the classroom.",
        kind: "arrival",
      },
      {
        time: "9:00 AM",
        title: "Breakfast",
        note: "Finished her porridge and fruit.",
        kind: "meal",
      },
      {
        time: "10:15 AM",
        title: "Story Time",
        note: "Listened to a story and named the animals.",
        kind: "learning",
      },
      {
        time: "11:00 AM",
        title: "Building Blocks",
        note: "Built a tower with a friend.",
        kind: "play",
      },
      {
        time: "12:15 PM",
        title: "Lunch",
        note: "Ate most of her rice and vegetables.",
        kind: "meal",
      },
      {
        time: "1:00–2:00 PM",
        title: "Nap",
        note: "1 hour of rest.",
        kind: "sleep",
      },
      {
        time: "4:20 PM",
        title: "Check Out",
        note: "Collected by an authorized guardian.",
        kind: "departure",
      },
    ],
    caregiverNote:
      "Liya had a calm day. She enjoyed story time and shared the building blocks.",
  },
  {
    id: 3,
    date: "Fri, Aug 21",
    isoDate: "2026-08-21",
    mood: "",
    summary: "Liya was absent. No activity report was recorded.",
    present: false,
    checkIn: "",
    checkOut: null,
    activities: [],
    caregiverNote: "",
  },
  {
    id: 4,
    date: "Thu, Aug 20",
    isoDate: "2026-08-20",
    mood: "Happy",
    summary: "Music, outdoor play, and colorful collage making.",
    present: true,
    checkIn: "8:10 AM",
    checkOut: "4:05 PM",
    activities: [
      {
        time: "8:10 AM",
        title: "Check In",
        note: "Liya arrived ready for the day.",
        kind: "arrival",
      },
      {
        time: "9:00 AM",
        title: "Breakfast",
        note: "Finished her breakfast.",
        kind: "meal",
      },
      {
        time: "10:00 AM",
        title: "Music & Movement",
        note: "Joined the songs and movement games.",
        kind: "learning",
      },
      {
        time: "11:00 AM",
        title: "Outdoor Play",
        note: "Played ball games with the group.",
        kind: "play",
      },
      {
        time: "12:15 PM",
        title: "Lunch",
        note: "Ate most of her lunch.",
        kind: "meal",
      },
      {
        time: "1:00–2:10 PM",
        title: "Nap",
        note: "1 hour 10 minutes of rest.",
        kind: "sleep",
      },
      {
        time: "2:30 PM",
        title: "Collage Making",
        note: "Explored colors and textures.",
        kind: "art",
      },
      {
        time: "4:05 PM",
        title: "Check Out",
        note: "Collected by an authorized guardian.",
        kind: "departure",
      },
    ],
    caregiverNote:
      "Liya enjoyed the music games and was proud of her colorful collage.",
  },
];
export function filterReports(filter: string, today = previewToday) {
  const end = new Date(today + "T00:00:00Z");
  const start = new Date(end);
  if (filter === "This Week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (filter === "This Month") start.setUTCDate(1);
  if (filter === "All") return reports;
  const from = start.toISOString().slice(0, 10);
  return reports.filter(
    (report) => report.isoDate >= from && report.isoDate <= today,
  );
}
