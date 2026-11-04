import moment from 'moment';

// An end time at or before the start belongs to the following local day.
export function shiftRange(date: string, startTime: string, endTime: string) {
  const day = date.slice(0, 10);
  const start = moment(`${day} ${startTime}`);
  const end = moment(`${day} ${endTime}`);
  if (end.isSameOrBefore(start)) end.add(1, 'day');
  return { start: start.toDate(), end: end.toDate() };
}
