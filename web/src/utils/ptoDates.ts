// PTO is a calendar date, not an instant in the viewer's timezone.
export function ptoDateKey(value: string): string {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const instant = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === day ? day : '';
}
export function formatPTODate(value: string): string {
  const day = ptoDateKey(value);
  if (!day) return 'Unknown';
  return new Date(`${day}T12:00:00`).toLocaleDateString();
}
export function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
