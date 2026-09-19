"use server";

// The Events section's own rows (#1241).
//
// The section used to ask whoever was taking minutes to retype what the Events
// module already knows -- what happened since the board last met, what is
// coming, and which of those still owe a report. This reads it instead, and
// leaves the Discussion box for what the board actually said about it.
//
// Two groups from one query, because they are one ordered list of events cut at
// the meeting's own day, and because a board agenda opens seven sections at
// once: a read per group per section is how a reference list becomes fourteen
// round trips.
//
// The events module is a separate entitlement from governance, and a board
// member commonly holds governance at manage and events at none. That is a
// section that shows no rows, never a section that fails: `unavailable` says
// which of the two happened so the tab can put a quiet line where the table
// would have been, and the agenda stays usable in the meeting either way.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { personDisplayName } from "@/lib/format";
import { findPreviousMeeting } from "./previous-meeting";
import {
  resolveAgendaEventWindows,
  type MeetingWindow,
} from "./meeting-context-window";

export type AgendaEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  /** The event's own zone, the fallback `ViewerTime` renders until the browser reports the viewer's. */
  timezone: string;
  status: string;
  report_status: string;
  event_lead_id: string | null;
  /** Already resolved through `personDisplayName`; null when the event has no lead. */
  event_lead_name: string | null;
};

export type AgendaEventsGroup = {
  /** Inclusive first and last day of the group, "YYYY-MM-DD" in the organization's zone. */
  fromDate: string;
  toDate: string;
  events: AgendaEvent[];
};

export type AgendaEventsFeed = {
  timeZone: string;
  /** Null when there is no previous meeting: nothing has happened "since" one yet. */
  since: AgendaEventsGroup | null;
  upcoming: AgendaEventsGroup;
  /**
   * Null when the groups above are the whole truth. `forbidden` means the
   * caller's tenant is not entitled to the events module, or their roles do not
   * reach it -- `my_permissions()` reports both as `none`. `error` means the
   * read failed. Neither is an error the caller has to act on, so neither
   * returns `{ error }`: the section says so in a line and keeps its box.
   */
  unavailable: "forbidden" | "error" | null;
};

const AGENDA_EVENT_SELECT =
  "id, name, starts_at, ends_at, timezone, status, report_status, event_lead_id, event_lead:people!events_event_lead_id_fkey(id, name, preferred_name, email)";

type RawAgendaEventRow = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  status: string;
  report_status: string;
  event_lead_id: string | null;
  event_lead: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
};

function toAgendaEvent(row: RawAgendaEventRow): AgendaEvent {
  return {
    id: row.id,
    name: row.name,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    report_status: row.report_status,
    event_lead_id: row.event_lead_id,
    event_lead_name: row.event_lead ? personDisplayName(row.event_lead) : null,
  };
}

function emptyGroup(window: MeetingWindow): AgendaEventsGroup {
  return { fromDate: window.fromDate, toDate: window.toDate, events: [] };
}

/** `and(...)` over one window, in the syntax PostgREST's `or` filter takes. */
function windowFilter(window: MeetingWindow): string {
  return `and(starts_at.gte.${window.fromInstant},starts_at.lte.${window.toInstant})`;
}

/**
 * The events either side of a meeting, for the agenda's Events section.
 *
 * `meetingDate` is the meeting's own `meeting_date` -- the tab already has it,
 * and it only decides which days the windows cover, never which rows the caller
 * may see. RLS does that, so there is no tenant filter in the query below.
 */
export async function listAgendaEventsAction(
  meetingId: string,
  meetingDate: string,
): Promise<{ data: AgendaEventsFeed } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const [timeZone, permissions, previous, agendaResult] = await Promise.all([
    getOrgTimeZone(supabase),
    getCurrentUserPermissions(supabase),
    findPreviousMeeting(supabase, meetingId, meetingDate),
    supabase
      .from("agendas")
      .select("next_meeting_date")
      .eq("meeting_id", meetingId)
      .maybeSingle(),
  ]);

  const windows = resolveAgendaEventWindows({
    meetingDate,
    // A failed lookup is the same shape as no previous meeting for the window
    // it produces, but not for what the section says: it must not claim the
    // board has never met. `unavailable: "error"` below covers it.
    previousMeetingDate:
      "error" in previous ? null : (previous.meeting?.meeting_date ?? null),
    nextMeetingDate:
      (agendaResult.data?.next_meeting_date as string | null) ?? null,
    timeZone,
  });

  const since = windows.since ? emptyGroup(windows.since) : null;
  const upcoming = emptyGroup(windows.upcoming);
  const base = { timeZone, since, upcoming };

  if ("error" in previous || agendaResult.error) {
    return { data: { ...base, unavailable: "error" } };
  }
  if (!hasPermission(permissions, "events", "view")) {
    return { data: { ...base, unavailable: "forbidden" } };
  }

  const filters = [windowFilter(windows.upcoming)];
  if (windows.since) filters.unshift(windowFilter(windows.since));

  const { data, error } = await supabase
    .from("events")
    .select(AGENDA_EVENT_SELECT)
    // The same exclusion `listCalendarEvents` makes: an archived event is one
    // the organization has put away, and a board reviewing its period should
    // not be handed it back.
    .neq("status", "archived")
    .or(filters.join(","))
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) return { data: { ...base, unavailable: "error" } };

  for (const row of (data ?? []) as unknown as RawAgendaEventRow[]) {
    // The windows abut at the meeting's own day, so one comparison partitions
    // them: anything at or before the end of that day is what the board is
    // reviewing, and everything else is what it is about to be asked about.
    // Parsed rather than compared as text -- PostgREST returns `+00:00` where
    // the window carries `Z`, and those two sort against each other wrongly.
    const group =
      windows.since &&
      Date.parse(row.starts_at) <= Date.parse(windows.since.toInstant)
        ? since
        : upcoming;
    group?.events.push(toAgendaEvent(row));
  }

  return { data: { ...base, unavailable: null } };
}
