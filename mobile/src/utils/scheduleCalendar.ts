/** Date and time values from /schedule/my-shifts are wall-clock values, not instants. */
export interface CalendarShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  name: string;
  project_name?: string;
  project_address?: string;
  notes?: string;
}

export const CALENDAR_TIME_NOTICE = 'Times have no timezone attached. Check the destination calendar timezone and imported times, especially around daylight saving changes.';
export const CALENDAR_INVALID = 'Calendar export needs valid dates, times and unique shift IDs. Refresh the schedule and check the shifts.';
export const CALENDAR_OVERNIGHT = 'Calendar export cannot determine an end date for overnight or equal-time shifts. No file was shared.';

function datePart(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new Error(CALENDAR_INVALID);
  // UTC is used only to validate a calendar date, never to convert a shift time.
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(CALENDAR_INVALID);
  return value.replace(/-/g, '');
}

function timePart(value: string): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) throw new Error(CALENDAR_INVALID);
  return value.replace(/:/g, '').padEnd(6, '0');
}

/** RFC 5545 TEXT escaping. Never allow content to introduce properties/components. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\')
    .replace(/\r\n|[\r\n\u2028\u2029]/g, '\\n')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** Fold at 75 UTF-8 octets, including the continuation space, without splitting a code point. */
function foldLine(value: string): string {
  let line = '', bytes = 0;
  const lines: string[] = [];
  for (const char of value) {
    const point = char.codePointAt(0)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += char;
    bytes += size;
  }
  lines.push(line);
  return lines.join('\r\n');
}

function textField(value: unknown, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) throw new Error(CALENDAR_INVALID);
  return value;
}

/** Export only the loaded range; no timezone, duration, recurrence or overnight policy is inferred. */
export function scheduleCalendar(
  shifts: readonly CalendarShift[],
  options: { companyId: string; start: string; end: string; timeNotice: string; now?: Date },
): string {
  datePart(options.start);
  datePart(options.end);
  if (options.start > options.end || !Array.isArray(shifts) || !shifts.length) throw new Error(CALENDAR_INVALID);
  const companyId = textField(options.companyId, true);
  const timeNotice = textField(options.timeNotice, true);
  const now = options.now || new Date();
  if (!Number.isFinite(now.getTime()) || now.getUTCFullYear() < 1 || now.getUTCFullYear() > 9999) throw new Error(CALENDAR_INVALID);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const seen = new Set<string>();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Future Jobs Pro AI//Schedule Export//EN', 'CALSCALE:GREGORIAN'];
  for (const shift of shifts) {
    if (!shift || typeof shift !== 'object') throw new Error(CALENDAR_INVALID);
    const id = textField(shift.id, true);
    if (seen.has(id)) throw new Error(CALENDAR_INVALID);
    seen.add(id);
    const date = datePart(shift.date);
    if (shift.date < options.start || shift.date > options.end) throw new Error(CALENDAR_INVALID);
    const start = timePart(shift.start_time), end = timePart(shift.end_time);
    if (end <= start) throw new Error(CALENDAR_OVERNIGHT);
    const name = textField(shift.name, true);
    const project = textField(shift.project_name);
    const address = textField(shift.project_address);
    const notes = textField(shift.notes);
    // JSON tuple + percent encoding is stable, collision-free and contains no raw separators/newlines.
    const uid = encodeURIComponent(JSON.stringify([companyId, id]));
    lines.push('BEGIN:VEVENT', `UID:${uid}@futurejobsproai.com`, `DTSTAMP:${stamp}`,
      `DTSTART:${date}T${start}`, `DTEND:${date}T${end}`,
      `SUMMARY:${escapeText(name)}`, `DESCRIPTION:${escapeText([project, notes, timeNotice].filter(Boolean).join('\n\n'))}`);
    if (address) lines.push(`LOCATION:${escapeText(address)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
