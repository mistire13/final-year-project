// Web does not provide Expo native notifications.
export type ReminderEvent = { id: number; event_date: string; event_time?: string | null };
export async function setupNotifications(_askPermission=true, _identity?:string): Promise<void> {}
export async function unregisterNotifications(): Promise<void> {}
export function subscribeNotificationResponses(_onResponse:(data:Record<string,unknown>)=>void):()=>void { return ()=>{}; }
export async function notifyIncomingMessage(_kind:'message'|'health'='message'): Promise<void> {}
export async function scheduleEventReminder(_event: ReminderEvent, _userId: number, _daycareId: number): Promise<void> {
  throw new Error('Phone reminders are available in the Android app.');
}
export async function cancelEventReminder(_eventId: number, _userId: number, _daycareId: number): Promise<void> {}
export async function clearAccountReminders(): Promise<void> {}
