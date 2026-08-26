import { describe, expect, test } from "bun:test";
import {
  computeNextInstanceWindow,
  findMissingCoverageSeries,
  hasStructuredRecurrence,
  resolveRecurrenceEndDay,
} from "./calendar-recurrence";

describe("hasStructuredRecurrence", () => {
  test("true when series_key is set", () => {
    expect(hasStructuredRecurrence({ series_key: "series-1" })).toBe(true);
  });

  test("false when series_key is null", () => {
    expect(hasStructuredRecurrence({ series_key: null })).toBe(false);
  });
});

describe("resolveRecurrenceEndDay", () => {
  test("returns the stored day when not a month-end anchor", () => {
    expect(
      resolveRecurrenceEndDay(
        {
          recurrence_end_month: 6,
          recurrence_end_day: 30,
          recurrence_end_is_month_end: false,
        },
        2027,
      ),
    ).toBe(30);
  });

  test("computes the true last day of February in a non-leap year", () => {
    expect(
      resolveRecurrenceEndDay(
        {
          recurrence_end_month: 2,
          recurrence_end_day: null,
          recurrence_end_is_month_end: true,
        },
        2027,
      ),
    ).toBe(28);
  });

  test("computes the true last day of February in a leap year", () => {
    expect(
      resolveRecurrenceEndDay(
        {
          recurrence_end_month: 2,
          recurrence_end_day: null,
          recurrence_end_is_month_end: true,
        },
        2028,
      ),
    ).toBe(29);
  });
});

describe("computeNextInstanceWindow", () => {
  test("computes a single-day window", () => {
    const window = computeNextInstanceWindow(
      {
        series_key: "s1",
        recurrence_start_month: 3,
        recurrence_start_day: 31,
        recurrence_end_month: 3,
        recurrence_end_day: 31,
        recurrence_end_is_month_end: false,
        time_zone: "America/Denver",
      },
      2028,
    );
    expect(window.startsAt).toBe("2028-03-31T06:00:00.000Z");
    expect(window.endsAt).toBe("2028-04-01T05:59:59.000Z");
  });

  test("resolves a month-end range onto Feb 29 in a leap target year", () => {
    const window = computeNextInstanceWindow(
      {
        series_key: "s2",
        recurrence_start_month: 2,
        recurrence_start_day: 1,
        recurrence_end_month: 2,
        recurrence_end_day: null,
        recurrence_end_is_month_end: true,
        time_zone: "America/Denver",
      },
      2028,
    );
    expect(window.startsAt).toBe("2028-02-01T07:00:00.000Z");
    // 23:59:59 MST (UTC-7, Feb predates the mid-March DST switch) on the
    // 29th crosses midnight UTC into March 1 -- the leap day itself is
    // still correctly resolved as day 29, not the non-leap-year 28.
    expect(window.endsAt).toBe("2028-03-01T06:59:59.000Z");
  });
});

describe("findMissingCoverageSeries", () => {
  const baseRow = {
    id: "id-1",
    series_key: "series-a",
    starts_at: "2026-06-01T06:00:00.000Z",
    time_zone: "America/Denver",
    priority_tier: 1 as const,
    calendar_status: "active",
  };

  test("does not flag a series that already has a target-year instance", () => {
    const rows = [{ ...baseRow, starts_at: "2027-06-01T06:00:00.000Z" }];
    expect(findMissingCoverageSeries(rows, 2027)).toEqual([]);
  });

  test("flags a series with no target-year instance, using the most recent row as the template", () => {
    const rows = [
      { ...baseRow, id: "old", starts_at: "2025-06-01T06:00:00.000Z" },
      { ...baseRow, id: "recent", starts_at: "2026-06-01T06:00:00.000Z" },
    ];
    const missing = findMissingCoverageSeries(rows, 2027);
    expect(missing).toHaveLength(1);
    expect(missing[0].seriesKey).toBe("series-a");
    expect(missing[0].sourceItem.id).toBe("recent");
  });

  test("excludes Tier 3 rows even if passed in", () => {
    const rows = [{ ...baseRow, priority_tier: 3 as const }];
    expect(findMissingCoverageSeries(rows, 2027)).toEqual([]);
  });

  test("excludes archived rows even if passed in", () => {
    const rows = [{ ...baseRow, calendar_status: "archived" }];
    expect(findMissingCoverageSeries(rows, 2027)).toEqual([]);
  });

  test("excludes rows with no series_key", () => {
    const rows = [{ ...baseRow, series_key: null }];
    expect(findMissingCoverageSeries(rows, 2027)).toEqual([]);
  });

  test("running twice with the generated row fed back in finds nothing missing the second time", () => {
    const rows = [baseRow];
    const missing = findMissingCoverageSeries(rows, 2027);
    expect(missing).toHaveLength(1);

    const generatedRow = {
      ...missing[0].sourceItem,
      id: "generated",
      starts_at: "2027-06-01T06:00:00.000Z",
    };
    const secondPass = findMissingCoverageSeries([...rows, generatedRow], 2027);
    expect(secondPass).toEqual([]);
  });
});
