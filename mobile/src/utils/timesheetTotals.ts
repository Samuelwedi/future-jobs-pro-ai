type Entry = { clock_in: string; work_date?: string; hours?: string; regularHours?: string; overtimeHours?: string };
const hours = (value?: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function timesheetDay(entry: Entry, timezone?: string): string {
  if (entry.work_date && /^\d{4}-\d{2}-\d{2}$/.test(entry.work_date)) return entry.work_date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(timezone ? { timeZone: timezone } : {}), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(entry.clock_in));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// The server owns break deductions, company overtime policy and locked payroll.
export function sumTimesheetHours(entries: Entry[]) {
  return entries.reduce((sum, entry) => ({
    total: sum.total + hours(entry.hours),
    regular: sum.regular + hours(entry.regularHours),
    overtime: sum.overtime + hours(entry.overtimeHours),
  }), { total: 0, regular: 0, overtime: 0 });
}
