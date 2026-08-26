import { describe, expect, test } from "bun:test";
import {
  daysInMonth,
  formatDueRelative,
  isEventActiveToday,
  zonedWallTimeToUtcIso,
} from "@/lib/time";

describe("formatDueRelative", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  test("reports a same-day due date as due today", () => {
    expect(formatDueRelative("2026-08-24T18:00:00Z", now)).toBe("Due today");
  });

  test("reports a future due date in days", () => {
    expect(formatDueRelative("2026-08-27T12:00:00Z", now)).toBe(
      "Due in 3 days",
    );
  });

  test("singularizes a one-day-out due date", () => {
    expect(formatDueRelative("2026-08-25T12:00:00Z", now)).toBe("Due in 1 day");
  });

  test("reports a past due date as overdue", () => {
    expect(formatDueRelative("2026-08-20T12:00:00Z", now)).toBe(
      "4 days overdue",
    );
  });

  test("singularizes a one-day overdue date", () => {
    expect(formatDueRelative("2026-08-23T12:00:00Z", now)).toBe(
      "1 day overdue",
    );
  });
});

describe("isEventActiveToday", () => {
  test("matches an event starting today in its own timezone", () => {
    const now = new Date("2026-08-23T18:00:00Z");
    const event = {
      starts_at: "2026-08-23T15:00:00Z",
      ends_at: "2026-08-23T20:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("respects the event's own timezone for 'today', not UTC", () => {
    // 2026-08-23T02:00:00Z is 2026-08-22 evening in America/Los_Angeles.
    const now = new Date("2026-08-23T02:00:00Z");
    const event = {
      starts_at: "2026-08-22T22:00:00-07:00",
      ends_at: null,
      timezone: "America/Los_Angeles",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("stays active for a multi-day event that started yesterday", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-21T10:00:00Z",
      ends_at: "2026-08-25T10:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("excludes a future event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-25T10:00:00Z",
      ends_at: "2026-08-25T18:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("excludes a past event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-20T10:00:00Z",
      ends_at: "2026-08-20T18:00:00Z",
      timezone: "UTC",
    };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("falls back to UTC instead of throwing on a malformed timezone", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = {
      starts_at: "2026-08-23T10:00:00Z",
      ends_at: null,
      timezone: "Not/AZone",
    };
    expect(() => isEventActiveToday(event, now)).not.toThrow();
    expect(isEventActiveToday(event, now)).toBe(true);
  });
});

describe("daysInMonth", () => {
  test("returns 28 for February in a non-leap year", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  test("returns 29 for February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  test("returns 30 for a 30-day month", () => {
    expect(daysInMonth(2027, 4)).toBe(30);
  });
});

describe("zonedWallTimeToUtcIso", () => {
  test("converts a Mountain Time (MDT, UTC-6) midnight in June", () => {
    expect(zonedWallTimeToUtcIso(2027, 6, 1, 0, 0, 0, "America/Denver")).toBe(
      "2027-06-01T06:00:00.000Z",
    );
  });

  test("converts a Mountain Time (MST, UTC-7) midnight in December", () => {
    expect(zonedWallTimeToUtcIso(2026, 12, 1, 0, 0, 0, "America/Denver")).toBe(
      "2026-12-01T07:00:00.000Z",
    );
  });

  test("converts an end-of-day instant in a zone with no DST", () => {
    expect(
      zonedWallTimeToUtcIso(2027, 5, 17, 23, 59, 59, "America/Phoenix"),
    ).toBe("2027-05-18T06:59:59.000Z");
  });

  test("round-trips through UTC itself", () => {
    expect(zonedWallTimeToUtcIso(2027, 1, 1, 0, 0, 0, "UTC")).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});
