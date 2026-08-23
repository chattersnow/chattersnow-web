"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";

export type EventRegistrant = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone: string | null;
  party_size: number;
  notes: string | null;
  created_at: string;
};

export async function listEventRegistrantsAction(
  eventId: string
): Promise<{ data: EventRegistrant[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_registrations")
    .select("id, event_id, name, email, phone, party_size, notes, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load registrants. Please try again." };
  }
  return { data: (data ?? []) as EventRegistrant[] };
}
