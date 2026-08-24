import { describe, expect, test } from "bun:test";
import { isEventActiveToday } from "@/lib/time";

describe("isEventActiveToday", () => {
  test("matches an event starting today in its own timezone", () => {
    const now = new Date("2026-08-23T18:00:00Z");
    const event = { starts_at: "2026-08-23T15:00:00Z", ends_at: "2026-08-23T20:00:00Z", timezone: "UTC" };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("respects the event's own timezone for 'today', not UTC", () => {
    // 2026-08-23T02:00:00Z is 2026-08-22 evening in America/Los_Angeles.
    const now = new Date("2026-08-23T02:00:00Z");
    const event = { starts_at: "2026-08-22T22:00:00-07:00", ends_at: null, timezone: "America/Los_Angeles" };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("stays active for a multi-day event that started yesterday", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = { starts_at: "2026-08-21T10:00:00Z", ends_at: "2026-08-25T10:00:00Z", timezone: "UTC" };
    expect(isEventActiveToday(event, now)).toBe(true);
  });

  test("excludes a future event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = { starts_at: "2026-08-25T10:00:00Z", ends_at: "2026-08-25T18:00:00Z", timezone: "UTC" };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("excludes a past event", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = { starts_at: "2026-08-20T10:00:00Z", ends_at: "2026-08-20T18:00:00Z", timezone: "UTC" };
    expect(isEventActiveToday(event, now)).toBe(false);
  });

  test("falls back to UTC instead of throwing on a malformed timezone", () => {
    const now = new Date("2026-08-23T10:00:00Z");
    const event = { starts_at: "2026-08-23T10:00:00Z", ends_at: null, timezone: "Not/AZone" };
    expect(() => isEventActiveToday(event, now)).not.toThrow();
    expect(isEventActiveToday(event, now)).toBe(true);
  });
});
