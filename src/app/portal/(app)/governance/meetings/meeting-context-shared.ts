// The shapes and pure helpers behind a meeting's dated context (#1223), split
// from the Server Action that reads them so the block, the export and the
// snapshot can all import them -- `meeting-context-actions.ts` is `"use server"`
// and may export nothing but async functions.
import { formatDateInZone } from "@/lib/time";
import {
  calendarItemHref,
  eventHref,
  type CalendarEntry,
  type CalendarItemEntryRow,
} from "../../calendar/calendar-entries";
import { computeNextInstanceWindow } from "../../calendar/calendar-recurrence";
import type { CalendarItemRow } from "../../calendar/calendar-shared";
import type { MeetingWindow } from "./meeting-context-window";

/**
 * A calendar item as this block reads it: the columns needed to place and
 * label a row, plus the structured-recurrence anchors, and none of the ~20
 * editorial columns `calendar/page.tsx` needs for the workspace.
 */
export type MeetingCalendarItemRow = CalendarItemEntryRow &
  Pick<
    CalendarItemRow,
    | "series_key"
    | "recurrence_start_month"
    | "recurrence_start_day"
    | "recurrence_end_month"
    | "recurrence_end_day"
    | "recurrence_end_is_month_end"
  >;

export const MEETING_CALENDAR_ITEM_SELECT =
  "id, title, item_type, starts_at, ends_at, time_zone, summary, calendar_status, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end";

export type MeetingContextEntry = CalendarEntry<MeetingCalendarItemRow>;

/** Which of the two sources could not be read. */
export type MeetingContextSourceKey = "events" | "calendar_items";

export type MeetingContextGap = {
  source: MeetingContextSourceKey;
  /** `forbidden`: the caller's role does not carry the resource. `error`: the read failed. */
  reason: "forbidden" | "error";
};

export type MeetingDatedContext = {
  /** The organization's zone, which is where the window was cut. */
  timeZone: string;
  /**
   * The day this was read, in the organization's zone. A printed agenda cannot
   * be clicked and cannot refresh, so the export says when the live list it is
   * printing was live.
   */
  asOf: string;
  /** The lookahead window, as the block and the export label it. */
  window: Pick<MeetingWindow, "fromDate" | "toDate">;
  entries: MeetingContextEntry[];
  /**
   * Empty when both sources answered, and never merged into `entries`:
   * "nothing is scheduled" and "you cannot see what is scheduled" must not
   * render the same.
   */
  gaps: MeetingContextGap[];
};

/**
 * The day this entry falls on, in the record's own zone -- the same reading
 * `agenda-view.tsx` groups the calendar by, and the value a pin copies into
 * `agendas.upcoming_dates`. Read in the viewer's zone instead, an evening
 * event pins to the wrong day for anyone east of it.
 */
export function meetingContextEntryDay(entry: MeetingContextEntry): string {
  return formatDateInZone(new Date(entry.starts_at), entry.time_zone || "UTC");
}

/**
 * How a pinned `upcoming_dates` row names the record it came from:
 * `event:<id>` or `calendar_item:<id>`. `CalendarEntry.id` already prefixes an
 * event's, so it is not usable as the source id.
 */
export function meetingContextSourceId(entry: MeetingContextEntry): string {
  return entry.kind === "event" ? entry.event.id : entry.item.id;
}

export function meetingContextSourceKey(entry: MeetingContextEntry): string {
  return `${entry.kind}:${meetingContextSourceId(entry)}`;
}

/**
 * The next instance of a recurring item, when one falls inside the window.
 *
 * An annual observance's `starts_at` sits in the year it was first entered, so
 * a plain window filter silently drops exactly the dates an agenda wants. The
 * candidate years are the ones the window touches -- a thirty-day window in
 * late December spans two.
 *
 * The month/day anchors are non-null whenever `series_key` is
 * (`calendar_items_recurrence_anchor_pair_check`), which is the same assumption
 * `computeNextInstanceWindow` already makes.
 */
export function nextInstanceInWindow(
  item: MeetingCalendarItemRow,
  window: MeetingWindow,
): { startsAt: string; endsAt: string } | null {
  const years = new Set([
    Number(window.fromDate.slice(0, 4)),
    Number(window.toDate.slice(0, 4)),
  ]);

  for (const year of [...years].sort((a, b) => a - b)) {
    const instance = computeNextInstanceWindow(item, year);
    if (
      instance.startsAt >= window.fromInstant &&
      instance.startsAt <= window.toInstant
    ) {
      return instance;
    }
  }
  return null;
}

/**
 * Where a pinned reference points, from the two fields the snapshot froze.
 *
 * The snapshot deliberately stores no `href` -- it is derivable, and freezing
 * it would be a second place the route lives -- so this is where a `kind` and
 * an `id` become one, through the calendar's own route helpers.
 */
export function datedRecordHref(
  kind: "event" | "calendar_item",
  id: string,
): string {
  return kind === "event" ? eventHref(id) : calendarItemHref(id);
}
