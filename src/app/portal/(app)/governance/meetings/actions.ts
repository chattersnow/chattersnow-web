"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseMeetingForm } from "./meeting-form";
import type { MeetingEvent, MeetingRow } from "./meeting-badges";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type MeetingActionResult =
  { error: string } | { success: true; id?: string };

export async function createMeetingAction(
  formData: FormData,
): Promise<MeetingActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to schedule a meeting.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseMeetingForm(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await supabase
    .from("governance_meetings")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return { error: "Could not schedule this meeting. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true, id: data.id };
}

export async function updateMeetingAction(
  id: string,
  formData: FormData,
): Promise<MeetingActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this meeting.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseMeetingForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("governance_meetings")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Could not update this meeting. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function listMeetingsAction(): Promise<
  { data: MeetingRow[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("governance_meetings")
    .select(
      "id, meeting_date, meeting_type, status, location, notes, minutes_approved_at, facilitator:people!governance_meetings_facilitator_person_id_fkey(id, name, preferred_name, email, phone), notetaker:people!governance_meetings_notetaker_person_id_fkey(id, name, preferred_name, email, phone), event_id, event:events!governance_meetings_event_id_fkey(id, name, starts_at)",
    )
    .order("meeting_date", { ascending: false });

  if (error) {
    return { error: "Could not load meetings. Please try again." };
  }
  return { data: (data ?? []) as unknown as MeetingRow[] };
}

/**
 * The events a meeting can be linked to (#1622).
 *
 * Loaded when the form opens rather than with the page, so the meetings list
 * does not pay for an events query nobody asked for. A governance manager who
 * cannot read events gets an empty list and no picker, and a link already on
 * the meeting is left as it is.
 */
export async function listMeetingEventOptionsAction(): Promise<MeetingEvent[]> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return [];

  const { data } = await supabase
    .from("events")
    .select("id, name, starts_at")
    .order("starts_at", { ascending: false });
  return data ?? [];
}

export type EventMeeting = Pick<
  MeetingRow,
  "id" | "meeting_date" | "meeting_type" | "status"
>;

/**
 * The meetings linked to an event, for the event's Overview (#1622).
 *
 * No permission check of its own: the governance_meetings select policy
 * already returns only the meetings this reader may see, so a coordinator
 * without governance access simply gets none.
 */
export async function listEventMeetingsAction(
  eventId: string,
): Promise<EventMeeting[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("governance_meetings")
    .select("id, meeting_date, meeting_type, status")
    .eq("event_id", eventId)
    .order("meeting_date", { ascending: true });
  return data ?? [];
}
