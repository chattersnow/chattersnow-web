import {
  daysInMonth,
  formatDateInZone,
  zonedWallTimeToUtcIso,
} from "@/lib/time";
import type { CalendarItemRow } from "./calendar-shared";

export type RecurrenceAnchors = Pick<
  CalendarItemRow,
  | "series_key"
  | "recurrence_start_month"
  | "recurrence_start_day"
  | "recurrence_end_month"
  | "recurrence_end_day"
  | "recurrence_end_is_month_end"
>;

/** True when `item` has structured recurrence anchors set (not just free-text `recurrence_rule`). */
export function hasStructuredRecurrence(
  item: Pick<CalendarItemRow, "series_key">,
): boolean {
  return item.series_key !== null;
}

/** Resolves the end day for a target year, computing the true last day of the month when `recurrence_end_is_month_end` is set instead of trusting a stored day-of-month. */
export function resolveRecurrenceEndDay(
  item: Pick<
    RecurrenceAnchors,
    | "recurrence_end_month"
    | "recurrence_end_day"
    | "recurrence_end_is_month_end"
  >,
  targetYear: number,
): number {
  if (item.recurrence_end_is_month_end) {
    return daysInMonth(targetYear, item.recurrence_end_month as number);
  }
  return item.recurrence_end_day as number;
}

/** Computes the `starts_at`/`ends_at` window a series' instance should occupy in `targetYear`, from its month-day anchors and its own timezone. */
export function computeNextInstanceWindow(
  item: RecurrenceAnchors & Pick<CalendarItemRow, "time_zone">,
  targetYear: number,
): { startsAt: string; endsAt: string } {
  const startsAt = zonedWallTimeToUtcIso(
    targetYear,
    item.recurrence_start_month as number,
    item.recurrence_start_day as number,
    0,
    0,
    0,
    item.time_zone,
  );
  const endsAt = zonedWallTimeToUtcIso(
    targetYear,
    item.recurrence_end_month as number,
    resolveRecurrenceEndDay(item, targetYear),
    23,
    59,
    59,
    item.time_zone,
  );
  return { startsAt, endsAt };
}

export type CoverageCandidateRow = Pick<
  CalendarItemRow,
  | "id"
  | "series_key"
  | "starts_at"
  | "time_zone"
  | "priority_tier"
  | "calendar_status"
>;

export type MissingCoverageSeries<T extends CoverageCandidateRow> = {
  seriesKey: string;
  sourceItem: T;
};

/**
 * Given every Tier 1/2, non-archived, structured-recurrence row, finds
 * series with no instance dated in `targetYear` and returns each one's
 * most-recent instance as the template to generate the next one from.
 * Filters defensively on tier/status even though callers should already
 * narrow the query, so this stays testable in isolation.
 */
export function findMissingCoverageSeries<T extends CoverageCandidateRow>(
  rows: T[],
  targetYear: number,
): MissingCoverageSeries<T>[] {
  const eligible = rows.filter(
    (row) =>
      row.series_key !== null &&
      (row.priority_tier === 1 || row.priority_tier === 2) &&
      row.calendar_status !== "archived",
  );

  const bySeriesKey = new Map<string, T[]>();
  for (const row of eligible) {
    const key = row.series_key as string;
    const group = bySeriesKey.get(key) ?? [];
    group.push(row);
    bySeriesKey.set(key, group);
  }

  const missing: MissingCoverageSeries<T>[] = [];
  for (const [seriesKey, group] of bySeriesKey) {
    const hasTargetYearInstance = group.some(
      (row) =>
        Number(
          formatDateInZone(new Date(row.starts_at), row.time_zone).slice(0, 4),
        ) === targetYear,
    );
    if (hasTargetYearInstance) continue;

    const sourceItem = group.reduce((latest, row) =>
      new Date(row.starts_at) > new Date(latest.starts_at) ? row : latest,
    );
    missing.push({ seriesKey, sourceItem });
  }

  return missing;
}
