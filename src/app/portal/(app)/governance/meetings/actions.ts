"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseMeetingForm } from "./meeting-form";
import type { MeetingRow } from "./meeting-badges";
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
      "id, meeting_date, meeting_type, status, location, notes, facilitator:people!facilitator_person_id(id, name, email, phone), notetaker:people!notetaker_person_id(id, name, email, phone)",
    )
    .order("meeting_date", { ascending: false });

  if (error) {
    return { error: "Could not load meetings. Please try again." };
  }
  return { data: (data ?? []) as unknown as MeetingRow[] };
}
