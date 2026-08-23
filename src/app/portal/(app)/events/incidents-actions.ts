"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseIncidentForm } from "./incidents-form";
import { checkPermission } from "@/lib/auth/permissions";

export type EventIncident = {
  id: string;
  event_id: string;
  occurred_at: string;
  description: string;
  severity: string;
  people_involved: string | null;
};

export type IncidentActionResult = { error: string } | { success: true };

export async function listEventIncidentsAction(
  eventId: string
): Promise<{ data: EventIncident[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "event_incidents", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_incidents")
    .select("id, event_id, occurred_at, description, severity, people_involved")
    .eq("event_id", eventId)
    .order("occurred_at", { ascending: false });

  if (error) {
    return { error: "Could not load incidents. Please try again." };
  }
  return { data: (data ?? []) as EventIncident[] };
}

export async function createEventIncidentAction(
  eventId: string,
  formData: FormData
): Promise<IncidentActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to log an incident." };
  }
  const permissionError = await checkPermission(supabase, "event_incidents", "manage");
  if (permissionError) return permissionError;

  const parsed = parseIncidentForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_incidents").insert({ event_id: eventId, ...parsed.data });

  if (error) {
    return { error: "Could not save the incident. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventIncidentAction(id: string): Promise<IncidentActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove an incident." };
  }
  const permissionError = await checkPermission(supabase, "event_incidents", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("event_incidents").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove the incident. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
