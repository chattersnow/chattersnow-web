// "The meeting before this one", in one place (#1241).
//
// Three readers wanted the same row and two of them had written the same query:
// the minutes-approval dialog (`getPreviousMeetingMinutesAction`), the standing
// sections' context windows (`getMeetingTopicContextAction`) and now the
// agenda's Events feed. They have to agree -- a board reading "since the last
// meeting" in one block and a different last meeting in the next would have no
// way to tell which period it is being asked about.
//
// Not a Server Action: it takes a client the caller already has and is imported
// by `"use server"` modules, which may only export async actions.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PreviousMeeting = { id: string; meeting_date: string };

/**
 * The most recent `governance_meetings` row dated before `beforeDate`,
 * excluding `meetingId` itself so a meeting is never its own predecessor.
 * Null when the board has not met before; `{ error: true }` when the read
 * failed, which callers surface differently and so must be able to tell apart
 * from "there is none".
 *
 * RLS scopes it to the caller's tenant, so there is no tenant filter here.
 */
export async function findPreviousMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  beforeDate: string,
): Promise<{ meeting: PreviousMeeting | null } | { error: true }> {
  const { data, error } = await supabase
    .from("governance_meetings")
    .select("id, meeting_date")
    .lt("meeting_date", beforeDate)
    .neq("id", meetingId)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: true };
  return { meeting: (data as PreviousMeeting | null) ?? null };
}
