import type { DaycareAnnouncement } from '../api/parentApi';

export function announcementLabel(item: Pick<DaycareAnnouncement, 'announcement_type'>) {
  return item.announcement_type === 'alert' ? 'Important notice' : item.announcement_type === 'meal_plan' ? 'Meal plan' : 'Daycare update';
}

export function filterAnnouncements(items: DaycareAnnouncement[], query: string, mealPlansOnly = false) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter(item => (!mealPlansOnly || item.announcement_type === 'meal_plan') &&
    `${item.title} ${item.body} ${item.author_name || ''}`.toLocaleLowerCase().includes(search));
}

export function validReadAnnouncementIds(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
}
