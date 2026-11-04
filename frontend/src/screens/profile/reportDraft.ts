export const mealTypes = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
] as const;
export const activityTypes = ["learning", "play"] as const;
export const portions = ["good", "fair", "poor", "none"] as const;
export const locations = ["indoor", "outdoor", "n_a"] as const;
export type MealDraft = {
  meal_type: (typeof mealTypes)[number];
  description: string;
  portion: (typeof portions)[number];
};
export type ActivityDraft = {
  activity_type: (typeof activityTypes)[number];
  description: string;
  location: (typeof locations)[number];
};
export const reportToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function reportPayload(draft: {
  childId: number;
  date: string;
  sleep: string;
  sleepNotes: string;
  mood: string;
  behavior: string;
  notes: string;
  meals: MealDraft[];
  activities: ActivityDraft[];
}) {
  const date = new Date(draft.date + "T00:00:00Z");
  if (!Number.isSafeInteger(draft.childId) || draft.childId <= 0)
    throw Error("Choose an assigned child.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== draft.date ||
    draft.date > reportToday()
  )
    throw Error("Enter a valid report date that is not in the future.");
  if (
    draft.sleep.trim() &&
    (!/^\d+$/.test(draft.sleep.trim()) || Number(draft.sleep) > 1440)
  )
    throw Error("Rest must be a whole number from 0 to 1440 minutes.");
  const meals = draft.meals
    .filter((m) => m.description.trim())
    .map((m) => ({ ...m, description: m.description.trim() }));
  const activities = draft.activities
    .filter((a) => a.description.trim())
    .map((a) => ({ ...a, description: a.description.trim() }));
  if (meals.length > 10 || activities.length > 20)
    throw Error("Use at most 10 meal entries and 20 activity entries.");
  if (
    !meals.length &&
    !activities.length &&
    !draft.notes.trim() &&
    !draft.behavior.trim() &&
    !draft.sleep.trim() &&
    !draft.sleepNotes.trim()
  )
    throw Error("Record a meal, activity, rest or observation before saving.");
  return {
    child_id: draft.childId,
    report_date: draft.date,
    sleep_duration_min: draft.sleep.trim() ? Number(draft.sleep) : null,
    sleep_notes: draft.sleepNotes.trim(),
    mood: draft.mood,
    behavior_notes: draft.behavior.trim(),
    general_observations: draft.notes.trim(),
    meals,
    activities,
  };
}
