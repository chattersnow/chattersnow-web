"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseContentForm } from "./content-form";

export type Agenda = {
  id: string;
  meeting_id: string;
  external_link: string | null;
  body_text: string | null;
};

export type AgendaActionResult = { error: string } | { success: true };

export async function getAgendaAction(
  meetingId: string
): Promise<{ data: Agenda | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agendas")
    .select("id, meeting_id, external_link, body_text")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load the agenda. Please try again." };
  }
  return { data: data as Agenda | null };
}

export async function upsertAgendaAction(
  meetingId: string,
  formData: FormData
): Promise<AgendaActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update the agenda." };
  }

  const parsed = parseContentForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("agendas")
    .upsert({ meeting_id: meetingId, ...parsed.data }, { onConflict: "meeting_id" });

  if (error) {
    return { error: "Could not save the agenda. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
