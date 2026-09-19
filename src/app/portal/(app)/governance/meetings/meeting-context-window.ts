// The two date windows a meeting reads its context from (#1223), with no Next
// in it -- the #1082 core/wrapper split, same as `minutes-core.ts`.
//
// Both windows are cut in the **organization's** time zone, and that is the
// whole reason this module exists rather than a `Date` and a `+30`.
// `governance_meetings.meeting_date` is a `timestamptz`, so an evening meeting
// reads as the next day in UTC; a lookahead anchored on that is thirty days
// from the wrong day, and every date near either edge is off by one. Days are
// therefore resolved through `utcIsoToDateInZone` and the arithmetic is done on
// "YYYY-MM-DD", which is the only representation where "thirty days later"
// means thirty *calendar* days across a DST boundary.
//
// Each window carries both forms because the sources are split between the two:
// a `date` column is compared against `fromDate`/`toDate`, a `timestamptz`
// against `fromInstant`/`toInstant`.
import {
  addDays,
  formatDateInZone,
  utcDateFromIsoDay,
  utcIsoToDateInZone,
  zonedWallTimeToUtcIso,
} from "@/lib/time";

/** How far past the meeting its "Next 30 days" block looks. A constant; a setting if anyone asks. */
export const AGENDA_LOOKAHEAD_DAYS = 30;

export type MeetingWindow = {
  /** Inclusive first day, "YYYY-MM-DD" in the organization's zone. */
  fromDate: string;
  /** Inclusive last day, "YYYY-MM-DD" in the organization's zone. */
  toDate: string;
  /** `fromDate` at 00:00:00 in the organization's zone, as a UTC instant. */
  fromInstant: string;
  /** `toDate` at 23:59:59 in the organization's zone, as a UTC instant. */
  toInstant: string;
};

export type MeetingWindows = {
  /**
   * The previous meeting's day through this one's -- what has happened since
   * the board last met. Falls back to `AGENDA_LOOKAHEAD_DAYS` before the
   * meeting when there is no prior meeting, so a first meeting still has a
   * period rather than an empty one.
   *
   * Unused by #1223 and consumed by #1224. It lives here rather than in a
   * second module because it is the same zone handling read in the same way,
   * and two copies of that is how the two halves drift apart.
   */
  review: MeetingWindow;
  /** The meeting's own day through `AGENDA_LOOKAHEAD_DAYS` later. */
  lookahead: MeetingWindow;
};

export type ResolveMeetingWindowsInput = {
  /** `governance_meetings.meeting_date`, a `timestamptz`. */
  meetingDate: string;
  /** The prior meeting's `meeting_date`, when there is one. */
  previousMeetingDate?: string | null;
  /** The organization's zone, from `getOrgTimeZone`. */
  timeZone: string;
};

/** A "YYYY-MM-DD" day shifted by whole calendar days, via the UTC-midnight reading the fiscal helpers use. */
function shiftIsoDay(day: string, days: number): string {
  return formatDateInZone(addDays(utcDateFromIsoDay(day), days), "UTC");
}

function windowBetween(
  fromDate: string,
  toDate: string,
  timeZone: string,
): MeetingWindow {
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  return {
    fromDate,
    toDate,
    fromInstant: zonedWallTimeToUtcIso(
      fromYear,
      fromMonth,
      fromDay,
      0,
      0,
      0,
      timeZone,
    ),
    // 23:59:59 rather than the next day's midnight, so both ends are inclusive
    // and a caller can use `lte` on each without one boundary meaning something
    // different from the other.
    toInstant: zonedWallTimeToUtcIso(
      toYear,
      toMonth,
      toDay,
      23,
      59,
      59,
      timeZone,
    ),
  };
}

export function resolveMeetingWindows(
  input: ResolveMeetingWindowsInput,
): MeetingWindows {
  const { timeZone } = input;
  const meetingDay = utcIsoToDateInZone(input.meetingDate, timeZone);
  const previousDay = input.previousMeetingDate
    ? utcIsoToDateInZone(input.previousMeetingDate, timeZone)
    : shiftIsoDay(meetingDay, -AGENDA_LOOKAHEAD_DAYS);

  return {
    review: windowBetween(previousDay, meetingDay, timeZone),
    lookahead: windowBetween(
      meetingDay,
      shiftIsoDay(meetingDay, AGENDA_LOOKAHEAD_DAYS),
      timeZone,
    ),
  };
}

// ---------------------------------------------------------------------------
// The Events section's two windows (#1241).
//
// Close to `resolveMeetingWindows` above and deliberately not the same call.
// The agenda's "Next 30 days" block is a fixed lookahead with a fallback, and
// both are wrong for a board reading the Events section: a board with no prior
// meeting has nothing to review rather than a month of it, and a board that
// has already set its next meeting date should be shown the events it will next
// be asked about rather than the whole season.

/** How far ahead the Events section looks when the agenda names no next meeting. */
export const AGENDA_EVENTS_LOOKAHEAD_DAYS = 90;

export type AgendaEventWindows = {
  /**
   * The previous meeting's day through this one's. **Null** when there is no
   * previous meeting: the section then says so rather than falling back to a
   * period, because "everything before the first meeting" is not a review.
   */
  since: MeetingWindow | null;
  /**
   * The day after the meeting through the agenda's `next_meeting_date`, or
   * `AGENDA_EVENTS_LOOKAHEAD_DAYS` out when the agenda names none. Starts the
   * day after so the meeting's own day belongs to `since` alone -- the two
   * windows abut without overlapping, and an event cannot be listed twice.
   */
  upcoming: MeetingWindow;
};

export type ResolveAgendaEventWindowsInput = {
  /** `governance_meetings.meeting_date`, a `timestamptz`. */
  meetingDate: string;
  /** The prior meeting's `meeting_date`, when there is one. */
  previousMeetingDate?: string | null;
  /** `agendas.next_meeting_date`, a `date` -- already "YYYY-MM-DD". */
  nextMeetingDate?: string | null;
  /** The organization's zone, from `getOrgTimeZone`. */
  timeZone: string;
};

export function resolveAgendaEventWindows(
  input: ResolveAgendaEventWindowsInput,
): AgendaEventWindows {
  const { timeZone } = input;
  const meetingDay = utcIsoToDateInZone(input.meetingDate, timeZone);
  const dayAfter = shiftIsoDay(meetingDay, 1);

  // A `next_meeting_date` on or before the meeting itself is a typo somebody
  // can fix on the agenda; it leaves `toDate` behind `fromDate`, the query
  // matches nothing, and the section reads "No events scheduled before the
  // next meeting" -- which is what that agenda literally says.
  const upcomingEnd =
    input.nextMeetingDate ||
    shiftIsoDay(meetingDay, AGENDA_EVENTS_LOOKAHEAD_DAYS);

  return {
    since: input.previousMeetingDate
      ? windowBetween(
          utcIsoToDateInZone(input.previousMeetingDate, timeZone),
          meetingDay,
          timeZone,
        )
      : null,
    upcoming: windowBetween(dayAfter, upcomingEnd, timeZone),
  };
}

// ---------------------------------------------------------------------------
// The Calendar-sourced sections' one window (#1242).
//
// One window, not the Events section's two: a board reviewing partner events
// or campaigns is looking forward from the meeting it is sitting in, and the
// calendar's own record of what already happened is the module, not the
// agenda. It starts on the meeting's own day because that day's items are on
// the table in front of it -- the Events section can afford to hand its
// meeting day to `since` because it has a `since` to hand it to.

/**
 * How far ahead a calendar-sourced section looks when the agenda names no next
 * meeting. The same ninety days the Events section falls back to, kept as its
 * own constant so either can move without moving the other.
 */
export const AGENDA_CALENDAR_LOOKAHEAD_DAYS = 90;

export type ResolveAgendaCalendarWindowInput = {
  /** `governance_meetings.meeting_date`, a `timestamptz`. */
  meetingDate: string;
  /** `agendas.next_meeting_date`, a `date` -- already "YYYY-MM-DD". */
  nextMeetingDate?: string | null;
  /** The organization's zone, from `getOrgTimeZone`. */
  timeZone: string;
};

export function resolveAgendaCalendarWindow(
  input: ResolveAgendaCalendarWindowInput,
): MeetingWindow {
  const meetingDay = utcIsoToDateInZone(input.meetingDate, input.timeZone);
  // A `next_meeting_date` behind the meeting is a typo on the agenda, and
  // leaves `toDate` before `fromDate`: the window matches nothing and the
  // section reads empty, which is what that agenda literally says.
  const toDate =
    input.nextMeetingDate ||
    shiftIsoDay(meetingDay, AGENDA_CALENDAR_LOOKAHEAD_DAYS);

  return windowBetween(meetingDay, toDate, input.timeZone);
}
