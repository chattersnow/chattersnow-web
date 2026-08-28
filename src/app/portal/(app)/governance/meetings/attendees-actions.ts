"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type MeetingAttendeePerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type MeetingAttendee = {
  id: string;
  meeting_id: string;
  person_id: string;
  attended: boolean;
  person: MeetingAttendeePerson;
};

export type AttendeeActionResult = { error: string } | { success: true };

export async function listMeetingAttendeesAction(
  meetingId: string,
): Promise<{ data: MeetingAttendee[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("governance_meeting_attendees")
    .select(
      "id, meeting_id, person_id, attended, person:people(id, name, email, phone)",
    )
    .eq("meeting_id", meetingId);

  if (error) {
    return { error: "Could not load attendees. Please try again." };
  }
  return { data: (data ?? []) as unknown as MeetingAttendee[] };
}

export async function createMeetingAttendeeAction(
  meetingId: string,
  personId: string,
  attended: boolean,
): Promise<AttendeeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add an attendee.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to add." };
  }

  const { error } = await supabase
    .from("governance_meeting_attendees")
    .insert({ meeting_id: meetingId, person_id: personId, attended });

  if (error) {
    if (error.code === "23505") {
      return { error: "This person is already listed for this meeting." };
    }
    return { error: "Could not add this attendee. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function updateMeetingAttendeeAction(
  id: string,
  attended: boolean,
): Promise<AttendeeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update an attendee.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meeting_attendees")
    .update({ attended })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this attendee. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function deleteMeetingAttendeeAction(
  id: string,
): Promise<AttendeeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove an attendee.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meeting_attendees")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not remove this attendee. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
