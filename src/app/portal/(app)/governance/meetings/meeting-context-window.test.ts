// The windows are cut in the organization's zone, and every assertion here is
// about a case where cutting them in UTC gives a different answer: an evening
// meeting, a span crossing a DST transition, and a first meeting with nothing
// before it.
import { describe, expect, test } from "bun:test";
import {
  AGENDA_CALENDAR_LOOKAHEAD_DAYS,
  AGENDA_EVENTS_LOOKAHEAD_DAYS,
  AGENDA_LOOKAHEAD_DAYS,
  resolveAgendaCalendarWindow,
  resolveAgendaEventWindows,
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

// The Events section's windows (#1241). Same zone handling, three different
// answers: no previous meeting means no period rather than a fallback one, the
// agenda's own next meeting date caps the lookahead, and the two windows must
// abut without overlapping or an event lands in both groups.
describe("resolveAgendaEventWindows", () => {
  test("spans the previous meeting's day through this one's", () => {
    const { since } = resolveAgendaEventWindows({
      meetingDate: "2026-03-18T02:00:00.000Z",
      previousMeetingDate: "2026-02-11T02:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });

    // 7pm Pacific on the 17th, not the 18th UTC reads it as.
    expect(since?.fromDate).toBe("2026-02-10");
    expect(since?.toDate).toBe("2026-03-17");
  });

  test("has no period to review when there is no previous meeting", () => {
    const { since, upcoming } = resolveAgendaEventWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      previousMeetingDate: null,
      timeZone: "America/Denver",
    });

    expect(since).toBeNull();
    // And the lookahead is unaffected: a first meeting still looks forward.
    expect(upcoming.fromDate).toBe("2026-03-19");
  });

  test("starts the lookahead the day after the meeting, so the two abut", () => {
    const { since, upcoming } = resolveAgendaEventWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      previousMeetingDate: "2026-02-11T18:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(since?.toDate).toBe("2026-03-18");
    expect(upcoming.fromDate).toBe("2026-03-19");
    // One second apart: nothing falls between them and nothing is in both.
    expect(
      Date.parse(upcoming.fromInstant) - Date.parse(since!.toInstant),
    ).toBe(1000);
  });

  test("caps the lookahead at the agenda's next meeting date", () => {
    const { upcoming } = resolveAgendaEventWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      nextMeetingDate: "2026-04-15",
      timeZone: "America/Denver",
    });

    expect(upcoming.toDate).toBe("2026-04-15");
  });

  test("looks 90 days ahead when the agenda names no next meeting", () => {
    const { upcoming } = resolveAgendaEventWindows({
      meetingDate: "2026-03-18T18:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(AGENDA_EVENTS_LOOKAHEAD_DAYS).toBe(90);
    expect(upcoming.toDate).toBe("2026-06-16");
  });
});

describe("resolveAgendaCalendarWindow", () => {
  test("starts on the meeting's own local day, not UTC's next one", () => {
    // 7pm on the 17th in Los Angeles is already the 18th in UTC; the section
    // has to cover the day the board is sitting in.
    const window = resolveAgendaCalendarWindow({
      meetingDate: "2026-03-18T02:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });

    expect(window.fromDate).toBe("2026-03-17");
    expect(window.fromInstant).toBe("2026-03-17T07:00:00.000Z");
  });

  test("ends at the agenda's next meeting date when it has one", () => {
    const window = resolveAgendaCalendarWindow({
      meetingDate: "2026-03-18T18:00:00.000Z",
      nextMeetingDate: "2026-04-15",
      timeZone: "America/Denver",
    });

    expect(window.toDate).toBe("2026-04-15");
    // Inclusive to the end of that day, so an item dated on it is in.
    expect(window.toInstant).toBe("2026-04-16T05:59:59.000Z");
  });

  test("looks 90 days ahead when the agenda names no next meeting", () => {
    const window = resolveAgendaCalendarWindow({
      meetingDate: "2026-03-18T18:00:00.000Z",
      timeZone: "America/Denver",
    });

    expect(AGENDA_CALENDAR_LOOKAHEAD_DAYS).toBe(90);
    expect(window.fromDate).toBe("2026-03-18");
    expect(window.toDate).toBe("2026-06-16");
  });
});
