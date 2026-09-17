"use server";

// The dated records a meeting should have in front of it (#1223).
//
// Read live and never copied: the agenda's "Next 30 days" block queries this on
// render, so a rescheduled event is right the next time anybody opens the
// agenda. Only a date somebody *pins* is written into `agendas.upcoming_dates`,
// and that copy is what survives into the frozen minutes snapshot and the
// printed export.
//
// Two sources under two different permissions, which is the whole reason this
// returns what it returns. The meeting association is `governance:view`; events
// are `events:view` and calendar items are `content_calendar:view`, each read
// under the caller's own RLS. A source the caller cannot see comes back absent
// with a reason rather than as an empty list -- the `board` role holds
// governance at manage and events at none, so "nothing is scheduled" and "you
// cannot see what is scheduled" are the two things a board member would most
// easily confuse.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import {
  calendarItemEntry,
  eventEntry,
  sortCalendarEntries,
} from "../../calendar/calendar-entries";
import { hasStructuredRecurrence } from "../../calendar/calendar-recurrence";
import { listCalendarEvents } from "../../calendar/queries";
import { resolveMeetingWindows } from "./meeting-context-window";
import {
  MEETING_CALENDAR_ITEM_SELECT,
  nextInstanceInWindow,
  type MeetingCalendarItemRow,
  type MeetingContextEntry,
  type MeetingContextGap,
  type MeetingDatedContext,
} from "./meeting-context-shared";

export async function listMeetingDatedContextAction(
  meetingId: string,
): Promise<{ data: MeetingDatedContext } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "governance", "view");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const [meetingResult, timeZone, permissions] = await Promise.all([
    supabase
      .from("governance_meetings")
      .select("id, meeting_date")
      .eq("id", meetingId)
      .maybeSingle(),
    getOrgTimeZone(supabase),
    getCurrentUserPermissions(supabase),
  ]);

  if (meetingResult.error) {
    return actionError(
      "server_error",
      "Could not load the dates around this meeting. Please try again.",
    );
  }
  if (!meetingResult.data) {
    return actionError("conflict", "That meeting no longer exists.");
  }

  const { lookahead } = resolveMeetingWindows({
    meetingDate: meetingResult.data.meeting_date as string,
    timeZone,
  });

  const canReadEvents = hasPermission(permissions, "events", "view");
  const canReadCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );

  const [events, calendarItems, recurringCandidates] = await Promise.all([
    canReadEvents
      ? listCalendarEvents(supabase, {
          window: {
            fromInstant: lookahead.fromInstant,
            toInstant: lookahead.toInstant,
          },
        })
      : null,
    canReadCalendar
      ? supabase
          .from("calendar_items")
          .select(MEETING_CALENDAR_ITEM_SELECT)
          .neq("calendar_status", "archived")
          .gte("starts_at", lookahead.fromInstant)
          .lte("starts_at", lookahead.toInstant)
      : null,
    // Every live series, whatever year its anchor row is dated in -- the window
    // filter above cannot see a 2024 row that recurs this March. Bounded by
    // how few structured-recurrence rows exist (they are the Tier 1/2
    // observances the coverage reminder already walks), not by a range.
    canReadCalendar
      ? supabase
          .from("calendar_items")
          .select(MEETING_CALENDAR_ITEM_SELECT)
          .neq("calendar_status", "archived")
          .not("series_key", "is", null)
      : null,
  ]);

  const gaps: MeetingContextGap[] = [];
  const entries: MeetingContextEntry[] = [];

  if (!canReadEvents) {
    gaps.push({ source: "events", reason: "forbidden" });
  } else if (events?.error) {
    gaps.push({ source: "events", reason: "error" });
  } else {
    entries.push(...(events?.events ?? []).map(eventEntry));
  }

  if (!canReadCalendar) {
    gaps.push({ source: "calendar_items", reason: "forbidden" });
  } else if (calendarItems?.error || recurringCandidates?.error) {
    gaps.push({ source: "calendar_items", reason: "error" });
  } else {
    const dated = (calendarItems?.data ?? []) as MeetingCalendarItemRow[];
    const datedIds = new Set(dated.map((item) => item.id));
    entries.push(...dated.map(calendarItemEntry));

    for (const item of (recurringCandidates?.data ??
      []) as MeetingCalendarItemRow[]) {
      if (datedIds.has(item.id)) continue;
      if (!hasStructuredRecurrence(item)) continue;
      const instance = nextInstanceInWindow(item, lookahead);
      if (!instance) continue;
      // Labelled with the instance's date; `item` stays the anchor row it was
      // read from, which is the record the href opens.
      entries.push({
        ...calendarItemEntry(item),
        starts_at: instance.startsAt,
        ends_at: instance.endsAt,
      });
    }
  }

  return {
    data: {
      timeZone,
      asOf: todayInZone(timeZone),
      window: { fromDate: lookahead.fromDate, toDate: lookahead.toDate },
      // Soonest first, through the calendar's own comparator: the two sources
      // arrive separately and a projected recurrence carries a date its query
      // never ordered on.
      entries: sortCalendarEntries(entries, "starts_at", "asc"),
      gaps,
    },
  };
}
