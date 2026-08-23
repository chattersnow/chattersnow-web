"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseImpactForm, type ImpactFormData } from "./impact-form";
import { checkPermission } from "@/lib/auth/permissions";

export type EventImpactNote = ImpactFormData & {
  id: string;
  event_id: string;
};

export type ImpactActionResult = { error: string } | { success: true };

export async function getEventImpactAction(
  eventId: string
): Promise<{ data: EventImpactNote | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "event_impact", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_impact_notes")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load impact notes. Please try again." };
  }
  return { data: data as EventImpactNote | null };
}

export async function upsertEventImpactAction(
  eventId: string,
  formData: FormData
): Promise<ImpactActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to save impact notes." };
  }
  const permissionError = await checkPermission(supabase, "event_impact", "manage");
  if (permissionError) return permissionError;

  const parsed = parseImpactForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_impact_notes")
    .upsert({ event_id: eventId, ...parsed.data }, { onConflict: "event_id" });

  if (error) {
    return { error: "Could not save impact notes. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
