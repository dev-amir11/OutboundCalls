export function getAppTimeZone() {
  return process.env.APP_TIMEZONE || "UTC";
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  const result = new Date(utcGuess.getTime() - offset);
  const corrected = timeZoneOffsetMs(result, timeZone);
  if (corrected !== offset) {
    return new Date(utcGuess.getTime() - corrected);
  }
  return result;
}

export function startOfZonedDay(date: Date, timeZone: string, dayOffset = 0) {
  const parts = getZonedParts(date, timeZone);
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return zonedDateTimeToUtc(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    calendar.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
}

export function dayWindow(now: Date, timeZone: string, dayOffset: number) {
  return {
    gte: startOfZonedDay(now, timeZone, dayOffset),
    lt: startOfZonedDay(now, timeZone, dayOffset + 1),
  };
}

export function startOfZonedWeek(now: Date, timeZone: string) {
  const parts = getZonedParts(now, timeZone);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return startOfZonedDay(now, timeZone, -daysSinceMonday);
}

export function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function startOfNamedZonedDay(value: string, timeZone: string) {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

export function nextNamedZonedDay(value: string, timeZone: string) {
  const start = startOfNamedZonedDay(value, timeZone);
  if (!start) return null;
  const probe = new Date(start.getTime() + 26 * 60 * 60 * 1000);
  return startOfZonedDay(probe, timeZone, 0);
}

export type InstantRange = { gte: Date; lt: Date };

export function inclusiveDateRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): InstantRange | undefined {
  if (!from && !to) return undefined;
  const start = from ? startOfNamedZonedDay(from, timeZone) : new Date(0);
  const end = to ? nextNamedZonedDay(to, timeZone) : new Date("2100-01-01T00:00:00.000Z");
  if (!start || !end) return undefined;
  return { gte: start, lt: end };
}

export function intersectRanges(a: InstantRange | undefined, b: InstantRange | undefined) {
  if (!a) return b;
  if (!b) return a;
  return {
    gte: new Date(Math.max(a.gte.getTime(), b.gte.getTime())),
    lt: new Date(Math.min(a.lt.getTime(), b.lt.getTime())),
  };
}

export function inRange(date: Date, range: InstantRange) {
  const time = date.getTime();
  return time >= range.gte.getTime() && time < range.lt.getTime();
}
