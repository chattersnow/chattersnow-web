/**
 * The events list's default order (#1609): upcoming events soonest first, then
 * past events most recent first.
 *
 * PostgREST can't order by `ends_at >= now()`, so the page runs the two halves
 * as separate queries and stitches one page out of them. An event is upcoming
 * until it ends -- one still running belongs with what's ahead, not what's
 * done -- and one with no `ends_at` ends when it starts, the same rule as the
 * public site's upcoming/past split.
 */

/** `.or()` filter for events that haven't ended yet. */
export function upcomingEventsFilter(nowIso: string) {
  return `ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`;
}

/** `.or()` filter for events that have ended. */
export function pastEventsFilter(nowIso: string) {
  return `ends_at.lt.${nowIso},and(ends_at.is.null,starts_at.lt.${nowIso})`;
}

type RowRange = { from: number; to: number };

/**
 * Which rows of each half a page covers, given the inclusive row range of the
 * whole list and how many upcoming events lead it. A half the page doesn't
 * reach is null, so the caller skips its query rather than asking PostgREST
 * for a range past its end (which it refuses).
 */
export function splitPageRange(
  offset: number,
  to: number,
  upcomingCount: number,
): { upcoming: RowRange | null; past: RowRange | null } {
  return {
    upcoming:
      offset < upcomingCount
        ? { from: offset, to: Math.min(to, upcomingCount - 1) }
        : null,
    past:
      to >= upcomingCount
        ? {
            from: Math.max(offset, upcomingCount) - upcomingCount,
            to: to - upcomingCount,
          }
        : null,
  };
}
