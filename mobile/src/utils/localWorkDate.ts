// Interpret a wall-clock input in the device timezone and reject normalization
// (invalid calendar dates and daylight-saving gaps must not silently move a shift).
export function localWorkInstant(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1000) throw Error('Use local date and time: YYYY-MM-DD HH:mm.');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw Error('This local date or time does not exist.');
  }
  return date.toISOString();
}
export function workAvailabilityRange(from: string, until: string): {startsAt: string; endsAt: string} {
  const startsAt = localWorkInstant(from), endsAt = localWorkInstant(until);
  const length = Date.parse(endsAt) - Date.parse(startsAt);
  if (length <= 0 || length > 366 * 86400000) throw Error('Choose an ordered range of at most 366 days.');
  return {startsAt, endsAt};
}
