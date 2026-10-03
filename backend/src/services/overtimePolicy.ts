import { companyDate } from './payPeriodCalendar';

export type OvertimeMode = 'daily' | 'weekly' | 'daily_weekly';
export interface OvertimePolicy {
  overtime_enabled: boolean;
  overtime_mode: OvertimeMode;
  overtime_threshold_hours: number;
  overtime_daily_threshold_hours: number;
  overtime_multiplier: number;
  overtime_week_start: number;
  timezone: string;
}
const defaults: OvertimePolicy = {
  overtime_enabled: true, overtime_mode: 'weekly', overtime_threshold_hours: 40,
  overtime_daily_threshold_hours: 8, overtime_multiplier: 1.5,
  overtime_week_start: 1, timezone: 'UTC',
};
export function readOvertimePolicy(company: any): OvertimePolicy {
  const policy = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (company[key] != null && company[key] !== '') (policy as any)[key] = company[key];
  }
  for (const key of ['overtime_threshold_hours','overtime_daily_threshold_hours','overtime_multiplier','overtime_week_start']) (policy as any)[key] = Number((policy as any)[key]);
  validateOvertimePolicy(policy);
  return policy;
}
export function validateOvertimePolicy(policy: OvertimePolicy) {
  if (typeof policy.overtime_enabled !== 'boolean') throw new Error('Enable overtime must be true or false');
  if (!['daily','weekly','daily_weekly'].includes(policy.overtime_mode)) throw new Error('Choose daily, weekly, or daily and weekly overtime');
  for (const [key, maximum] of [['overtime_threshold_hours',168],['overtime_daily_threshold_hours',24]] as const) {
    const value = policy[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(`${key} must be greater than 0 and no more than ${maximum}`);
  }
  if (typeof policy.overtime_multiplier !== 'number' || !Number.isFinite(policy.overtime_multiplier) || policy.overtime_multiplier < 1 || policy.overtime_multiplier > 10) throw new Error('Overtime multiplier must be between 1 and 10');
  if (!Number.isInteger(policy.overtime_week_start) || policy.overtime_week_start < 0 || policy.overtime_week_start > 6) throw new Error('Choose a valid workweek start day');
  if (typeof policy.timezone !== 'string' || !policy.timezone.trim()) throw new Error('A company time zone is required');
  try { companyDate(policy.timezone); } catch { throw new Error('Enter a valid IANA time zone, for example America/Edmonton'); }
}
export const addDays = (date: string, days: number) => new Date(Date.parse(date+'T00:00:00Z') + days*86400000).toISOString().slice(0,10);
export function weekOf(date: string, start: number) {
  return addDays(date, -((new Date(date+'T00:00:00Z').getUTCDay()-start+7)%7));
}

export interface OvertimeEntry {
  id: string; clock_in: string | Date; clock_out: string | Date; break_minutes?: number | string;
}
export interface OvertimeHours { regular: number; overtime: number; total: number; }

// Thresholds use elapsed paid hours. Calendar days/weeks use the company's time zone.
// Break timestamps are not recorded; overnight breaks are apportioned by elapsed duration.
export function calculateOvertime(entries: OvertimeEntry[], policy: OvertimePolicy): Map<string, OvertimeHours> {
  validateOvertimePolicy(policy);
  const daily = new Map<string, number>(), weeklyRegular = new Map<string, number>();
  const result = new Map<string, OvertimeHours>();
  const segments: { id: string; start: number; day: string; hours: number }[] = [];
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: policy.timezone, year:'numeric',month:'2-digit',day:'2-digit' });
  const localDate = (time: number) => {
    const parts = formatter.formatToParts(time);
    return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');
  };
  const sorted = [...entries].sort((a,b)=>+new Date(a.clock_in)-+new Date(b.clock_in) || a.id.localeCompare(b.id));
  let previousEnd = -Infinity;
  for (const entry of sorted) {
    if (result.has(entry.id)) throw new Error('Duplicate time entry');
    const start = +new Date(entry.clock_in), end = +new Date(entry.clock_out), breaks = Number(entry.break_minutes ?? 0);
    const duration = (end-start)/3600000;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 168) throw new Error('Time entries must have a positive duration of at most seven days');
    if (!Number.isFinite(breaks) || breaks < 0 || breaks/60 > duration) throw new Error('Break time cannot exceed the shift duration');
    if (start < previousEnd) throw new Error('Overlapping time entries must be corrected before calculating overtime');
    previousEnd = end;
    result.set(entry.id, { regular:0, overtime:0, total:duration-breaks/60 });
    const paidRatio = (duration-breaks/60)/duration;
    let cursor = start;
    while (cursor < end) {
      const day = localDate(cursor);
      let boundary = end;
      if (localDate(end-1) !== day) {
        // Binary search the first instant outside this local day: handles DST and midnight offsets.
        let low = cursor, high = Math.min(end, cursor+48*3600000);
        while (high-low > 1) { const mid = Math.floor((low+high)/2); if (localDate(mid) === day) low=mid; else high=mid; }
        boundary = high;
      }
      segments.push({id:entry.id,start:cursor,day,hours:(boundary-cursor)/3600000*paidRatio});
      cursor = boundary;
    }
  }
  segments.sort((a,b)=>a.start-b.start || a.id.localeCompare(b.id));
  for (const part of segments) {
    const dayHours = daily.get(part.day) ?? 0;
    const week = weekOf(part.day, policy.overtime_week_start);
    const weekRegular = weeklyRegular.get(week) ?? 0;
    const dailyLimit = policy.overtime_enabled && policy.overtime_mode !== 'weekly' ? policy.overtime_daily_threshold_hours : Infinity;
    const weeklyLimit = policy.overtime_enabled && policy.overtime_mode !== 'daily' ? policy.overtime_threshold_hours : Infinity;
    const regular = Math.min(part.hours, Math.max(0,dailyLimit-dayHours), Math.max(0,weeklyLimit-weekRegular));
    const row = result.get(part.id)!;
    row.regular += regular;
    row.overtime += part.hours-regular;
    daily.set(part.day,dayHours+part.hours);
    weeklyRegular.set(week,weekRegular+regular);
  }
  return result;
}
