/** Calendar labels are local dates, never UTC instants. */
export function calendarDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
}
export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error('Invalid calendar date');
  const date = new Date(+match[1], +match[2]-1, +match[3], 12);
  if (calendarDate(date) !== match[0]) throw new Error('Invalid calendar date');
  return date;
}
