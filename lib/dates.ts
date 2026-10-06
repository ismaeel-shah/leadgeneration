/** Calendar-day helpers. Stored values are UTC instants; day boundaries use the user's zone. */

export const DEFAULT_TIMEZONE = "Asia/Karachi";

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatters.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, value);
  }
  return value;
}

function assertDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Expected a valid Date");
  }
}

function localParts(date: Date, timezone: string): LocalParts {
  assertDate(date);
  const parts = formatter(timezone).formatToParts(date);
  const get = (name: string) => Number(parts.find((part) => part.type === name)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    millisecond: date.getUTCMilliseconds(),
  };
}

function offsetAt(instant: number, timezone: string): number {
  const date = new Date(instant);
  const parts = localParts(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return localAsUtc - instant;
}

function instantForLocal(parts: LocalParts, timezone: string): Date {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  let instant = localAsUtc;
  const visited = new Set<number>();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (visited.has(instant)) {
      // A spring DST gap has no exact instant. Roll forward to the first
      // possible wall-clock time rather than moving the date backwards.
      return new Date(Math.max(...visited));
    }
    visited.add(instant);
    const next = localAsUtc - offsetAt(instant, timezone);
    if (next === instant) return new Date(instant);
    instant = next;
  }
  return new Date(instant);
}

/** Adds local calendar days, preserving the local wall-clock time. */
export function addCalendarDays(date: Date, days: number, timezone = DEFAULT_TIMEZONE): Date {
  if (!Number.isInteger(days)) throw new RangeError("days must be an integer");
  const parts = localParts(date, timezone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second, parts.millisecond),
  );
  return instantForLocal(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      millisecond: shifted.getUTCMilliseconds(),
    },
    timezone,
  );
}

export function startOfDay(date: Date, timezone = DEFAULT_TIMEZONE): Date {
  const parts = localParts(date, timezone);
  return instantForLocal({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timezone);
}

export function endOfDay(date: Date, timezone = DEFAULT_TIMEZONE): Date {
  return new Date(addCalendarDays(startOfDay(date, timezone), 1, timezone).getTime() - 1);
}

export function calendarDayKey(date: Date, timezone = DEFAULT_TIMEZONE): string {
  const { year, month, day } = localParts(date, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isSameCalendarDay(a: Date, b: Date, timezone = DEFAULT_TIMEZONE): boolean {
  return calendarDayKey(a, timezone) === calendarDayKey(b, timezone);
}

/** Counts date changes, independent of daylight-saving hour changes. */
export function calendarDaysBetween(from: Date, to: Date, timezone = DEFAULT_TIMEZONE): number {
  const a = localParts(from, timezone);
  const b = localParts(to, timezone);
  const dayA = Date.UTC(a.year, a.month - 1, a.day);
  const dayB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((dayB - dayA) / 86_400_000);
}

export function isDueToday(dueAt: Date, now: Date, timezone = DEFAULT_TIMEZONE): boolean {
  return isSameCalendarDay(dueAt, now, timezone);
}

export function isOverdue(dueAt: Date, now: Date, timezone = DEFAULT_TIMEZONE): boolean {
  return dueAt.getTime() < startOfDay(now, timezone).getTime();
}

export function isStaleRequest(
  requestSentAt: Date,
  now: Date,
  staleRequestDays = 21,
  timezone = DEFAULT_TIMEZONE,
): boolean {
  return addCalendarDays(requestSentAt, staleRequestDays, timezone).getTime() < now.getTime();
}
