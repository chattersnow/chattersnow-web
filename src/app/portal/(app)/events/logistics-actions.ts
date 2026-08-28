"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLogisticsForm } from "./logistics-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type EventLogistics = {
  event_id: string;
  meeting_point: string | null;
  gear_requirements: string | null;
  transportation: string | null;
  food: string | null;
  supplies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

export type LogisticsActionResult = { error: string } | { success: true };

export async function getEventLogisticsAction(
  eventId: string,
): Promise<{ data: EventLogistics | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_logistics")
    .select(
      "event_id, meeting_point, gear_requirements, transportation, food, supplies, emergency_contact_name, emergency_contact_phone, notes",
    )
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load logistics. Please try again." };
  }
  return { data: data as EventLogistics | null };
}

export async function upsertEventLogisticsAction(
  eventId: string,
  formData: FormData,
): Promise<LogisticsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update logistics.",
  );
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseLogisticsForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_logistics")
    .upsert(
      { event_id: eventId, ...parsed.data, updated_by: user.id },
      { onConflict: "event_id" },
    );

  if (error) {
    return { error: "Could not save logistics. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
