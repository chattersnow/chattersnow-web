export function nowMs() {
  return Date.now();
}

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  {
    value: "America/Phoenix",
    label: "Mountain Time, no DST (America/Phoenix)",
  },
  {
    value: "America/Los_Angeles",
    label: "Pacific Time (America/Los_Angeles)",
  },
  { value: "America/Anchorage", label: "Alaska Time (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Pacific/Honolulu)" },
] as const;

export type EventWindow = {
  starts_at: string;
  ends_at: string | null;
  timezone: string;
};

export function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Formats an ISO instant in the event's own timezone rather than the
 * rendering environment's. Falls back to the given options without a zone
 * if `timeZone` turns out not to be a valid IANA identifier.
 */
export function formatDateTimeInZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      new Date(iso),
    );
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Number of days in `month` (1-12) of `year`, leap-year-aware. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Converts a wall-clock date/time in `timeZone` to the UTC instant it
 * represents, as an ISO string. There's no date/timezone library in this
 * project (only `Intl`, per `formatDateInZone` above), so this does the
 * conversion the other direction: guess the UTC instant by treating the
 * wall-clock values as UTC, then correct the guess by however far off that
 * guess's wall-clock reading in `timeZone` turns out to be. One correction
 * pass is enough except right at a DST transition, where a second pass
 * converges -- callers here only ever pass midnight/end-of-day anchors, not
 * a literal 2am transition instant.
 */
export function zonedWallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): string {
  const wallTimeAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = wallTimeAsUtcMs;

  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guessMs));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const observedMs = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const deltaMs = wallTimeAsUtcMs - observedMs;
    if (deltaMs === 0) break;
    guessMs += deltaMs;
  }

  return new Date(guessMs).toISOString();
}

/**
 * Converts a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm" or
 * "...:ss"), which carries no UTC offset of its own, into the UTC instant it
 * represents when read as wall-clock time in `timeZone`. Use this instead of
 * `new Date(value).toISOString()` for any datetime-local value paired with
 * an explicit timezone field -- `new Date` on a naive string is parsed in
 * whatever timezone the running process happens to be in, which differs
 * between local dev and production. Returns null if `value` isn't in the
 * expected shape.
 */
export function datetimeLocalToUtcIso(
  value: string,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return zonedWallTimeToUtcIso(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
    timeZone,
  );
}

/**
 * Formats a UTC instant as a wall-clock "YYYY-MM-DDTHH:mm" string in
 * `timeZone`, for seeding a `<input type="datetime-local">` value edited
 * alongside an explicit timezone field. Pairs with `datetimeLocalToUtcIso` --
 * using the viewer's browser offset here instead would show the wrong
 * wall-clock time whenever the viewer isn't in the record's own timezone,
 * and silently shift the stored instant if re-saved unchanged.
 */
export function utcIsoToDatetimeLocalInZone(
  iso: string,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * "Due today" / "Due in N days" / "N days overdue", rounding to whole days
 * so a due time earlier today doesn't read as "overdue" and one later today
 * doesn't read as "in 1 day".
 */
export function formatDueRelative(
  dueAt: string | Date,
  now: Date = new Date(),
): string {
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((due.getTime() - now.getTime()) / dayMs);

  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  const overdueDays = Math.abs(days);
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

/**
 * True if the event shares today's calendar date in its own timezone, or is
 * currently between starts_at and ends_at (for events that started on a
 * prior day and are still running, or have no ends_at).
 */
export function isEventActiveToday(
  event: EventWindow,
  now: Date = new Date(),
): boolean {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;

  let sameLocalDay: boolean;
  try {
    sameLocalDay =
      formatDateInZone(startsAt, event.timezone) ===
      formatDateInZone(now, event.timezone);
  } catch {
    sameLocalDay =
      formatDateInZone(startsAt, "UTC") === formatDateInZone(now, "UTC");
  }
  if (sameLocalDay) return true;

  return startsAt <= now && (endsAt === null || endsAt >= now);
}
