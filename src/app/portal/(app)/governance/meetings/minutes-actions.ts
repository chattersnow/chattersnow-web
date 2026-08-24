"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentForm } from "./content-form";
import { checkPermission } from "@/lib/auth/permissions";

export type Minutes = {
  id: string;
  meeting_id: string;
  external_link: string | null;
  body_text: string | null;
};

export type MinutesActionResult = { error: string } | { success: true };

export async function getMinutesAction(
  meetingId: string,
): Promise<{ data: Minutes | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("minutes")
    .select("id, meeting_id, external_link, body_text")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load the minutes. Please try again." };
  }
  return { data: data as Minutes | null };
}

export async function upsertMinutesAction(
  meetingId: string,
  formData: FormData,
): Promise<MinutesActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update the minutes." };
  }
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseContentForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("minutes")
    .upsert(
      { meeting_id: meetingId, ...parsed.data },
      { onConflict: "meeting_id" },
    );

  if (error) {
    return { error: "Could not save the minutes. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
