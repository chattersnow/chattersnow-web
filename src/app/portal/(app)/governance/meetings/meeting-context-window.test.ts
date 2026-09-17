// The windows are cut in the organization's zone, and every assertion here is
// about a case where cutting them in UTC gives a different answer: an evening
// meeting, a span crossing a DST transition, and a first meeting with nothing
// before it.
import { describe, expect, test } from "bun:test";
import {
  AGENDA_LOOKAHEAD_DAYS,
  resolveMeetingWindows,
} from "./meeting-context-window";

describe("resolveMeetingWindows", () => {
  test("anchors on the meeting's own local day, not UTC's next one", () => {
    // 7pm on the 17th in Los Angeles is already the 18th in UTC.
    const { lookahead } = resolveMeetingWindows({
      meetingDate: "2026-03-18T02:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });

    expect(lookahead.fromDate).toBe("2026-03-17");
    expect(lookahead.toDate).toBe("2026-04-16");
    // Midnight Pacific, which is 7am UTC -- not midnight UTC.
    expect(lookahead.fromInstant).toBe("2026-03-17T07:00:00.000Z");
  });

  test("a window crossing a DST boundary is still 30 local days", () => {
    const { lookahead } = resolveMeetingWindows({
      meetingDate: "2026-03-02T02:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(lookahead.fromDate).toBe("2026-03-01");
    expect(lookahead.toDate).toBe("2026-03-31");
    // Standard time at the start, daylight time at the end: the two instants
    // are 30 days and 23 hours apart, not a round 30 days.
    expect(lookahead.fromInstant).toBe("2026-03-01T07:00:00.000Z");
    expect(lookahead.toInstant).toBe("2026-04-01T05:59:59.000Z");
  });

  test("spans the days between two meetings for the review window", () => {
    const { review } = resolveMeetingWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      previousMeetingDate: "2026-02-11T18:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(review.fromDate).toBe("2026-02-11");
    expect(review.toDate).toBe("2026-03-18");
  });

  test("falls back to 30 days before when there is no previous meeting", () => {
    const { review, lookahead } = resolveMeetingWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      previousMeetingDate: null,
      timeZone: "America/Denver",
    });

    expect(review.toDate).toBe("2026-03-18");
    expect(review.fromDate).toBe("2026-02-16");
    expect(lookahead.fromDate).toBe(review.toDate);
    expect(AGENDA_LOOKAHEAD_DAYS).toBe(30);
  });

  test("crosses a year boundary without losing days", () => {
    const { lookahead } = resolveMeetingWindows({
      meetingDate: "2026-12-20T18:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(lookahead.fromDate).toBe("2026-12-20");
    expect(lookahead.toDate).toBe("2027-01-19");
  });
});
