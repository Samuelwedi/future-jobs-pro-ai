export function zonedTimestamp(value: string): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
      value.trim(),
    );
  if (!match) throw Error("Enter an ISO date/time with an explicit timezone.");
  const [, year, month, day, hour, minute, second = "0", fraction = "", zone] =
    match;
  const offsetHours = zone.toUpperCase() === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinutes =
    zone.toUpperCase() === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    offsetMinutes > 59 ||
    offsetHours > 14 ||
    (offsetHours === 14 && offsetMinutes)
  )
    throw Error("Enter a valid calendar date, time and timezone offset.");
  const epoch = Date.parse(value.trim());
  if (!Number.isFinite(epoch))
    throw Error("Enter a valid calendar date, time and timezone offset.");
  const offset =
    (zone.startsWith("-") ? -1 : 1) * (offsetHours * 60 + offsetMinutes);
  const wall = new Date(epoch + offset * 60000);
  if (
    wall.getUTCFullYear() !== Number(year) ||
    wall.getUTCMonth() + 1 !== Number(month) ||
    wall.getUTCDate() !== Number(day) ||
    wall.getUTCHours() !== Number(hour) ||
    wall.getUTCMinutes() !== Number(minute) ||
    wall.getUTCSeconds() !== Number(second) ||
    wall.getUTCMilliseconds() !== Number(fraction.padEnd(3, "0"))
  )
    throw Error("Enter a valid calendar date, time and timezone offset.");
  return new Date(epoch).toISOString();
}

export function availabilityInput(from: string, until: string) {
  const startsAt = zonedTimestamp(from),
    endsAt = zonedTimestamp(until);
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (duration <= 0 || duration > 366 * 86400000)
    throw Error("Choose an end after the start, within 366 days.");
  return { startsAt, endsAt };
}

export function coverApprovalKey(swapId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      swapId,
    )
  )
    throw Error("Cover request is unavailable.");
  return "mobile-cover-approve:" + swapId;
}
