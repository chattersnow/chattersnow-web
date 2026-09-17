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
