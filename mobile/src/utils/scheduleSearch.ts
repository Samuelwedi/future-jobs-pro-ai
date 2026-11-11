export type SearchableShift = { date?: string; name?: string; project_name?: string; project_address?: string; notes?: string };
const fold = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
/** Search only records returned by the authorized date-range endpoint. Never fetch a broader scope. */
export function searchSchedule<T extends SearchableShift>(shifts: T[], query: string): T[] {
  const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return shifts;
  return shifts.filter(shift => {
    const text = fold([shift.name, shift.project_name, shift.project_address, shift.notes].filter(value => typeof value === 'string').join(' '));
    return terms.every(term => text.includes(term));
  });
}
export function visibleSchedule<T extends SearchableShift>(shifts: T[], query: string, selectedDate: string, singleDay: boolean): T[] {
  const found = searchSchedule(shifts, query);
  return singleDay && !query.trim() ? found.filter(shift => shift.date?.split('T')[0] === selectedDate) : found;
}
