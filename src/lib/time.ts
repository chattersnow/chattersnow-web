export function nowMs() {
  return Date.now();
}

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

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * True if the event shares today's calendar date in its own timezone, or is
 * currently between starts_at and ends_at (for events that started on a
 * prior day and are still running, or have no ends_at).
 */
export function isEventActiveToday(event: EventWindow, now: Date = new Date()): boolean {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;

  let sameLocalDay: boolean;
  try {
    sameLocalDay = formatDateInZone(startsAt, event.timezone) === formatDateInZone(now, event.timezone);
  } catch {
    sameLocalDay = formatDateInZone(startsAt, "UTC") === formatDateInZone(now, "UTC");
  }
  if (sameLocalDay) return true;

  return startsAt <= now && (endsAt === null || endsAt >= now);
}
