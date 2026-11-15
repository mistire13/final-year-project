export function addisCalendarDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function invoiceIsOverdue(dueDate: string, status: string, now = new Date()): boolean {
  if (status === 'paid' || status === 'cancelled') return false;
  const date = String(dueDate ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < addisCalendarDay(now);
}
