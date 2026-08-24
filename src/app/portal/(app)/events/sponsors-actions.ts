"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSponsorForm } from "./sponsor-form";
import { checkPermission } from "@/lib/auth/permissions";

export type EventSponsorPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type EventSponsor = {
  id: string;
  event_id: string;
  person_id: string;
  support_type: string;
  in_kind_description: string | null;
  contribution_value: number | string | null;
  is_public: boolean;
  notes: string | null;
  follow_up_status: string;
  follow_up_notes: string | null;
  person: EventSponsorPerson;
};

export type SponsorActionResult = { error: string } | { success: true };

export async function listEventSponsorsAction(
  eventId: string,
): Promise<{ data: EventSponsor[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_sponsors")
    .select(
      "id, event_id, person_id, support_type, in_kind_description, contribution_value, is_public, notes, follow_up_status, follow_up_notes, person:people(id, name, email, phone)",
    )
    .eq("event_id", eventId);

  if (error) {
    return { error: "Could not load sponsors. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventSponsor[] };
}

export async function createEventSponsorAction(
  eventId: string,
  personId: string,
  formData: FormData,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a sponsor." };
  }
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_sponsors")
    .insert({ event_id: eventId, person_id: personId, ...parsed.data });

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This person is already linked to this event as a sponsor. Edit their existing entry instead.",
      };
    }
    return { error: "Could not save the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventSponsorAction(
  id: string,
  formData: FormData,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update a sponsor." };
  }
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseSponsorForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_sponsors")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Could not update the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventSponsorAction(
  id: string,
): Promise<SponsorActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a sponsor." };
  }
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("event_sponsors").delete().eq("id", id);

  if (error) {
    return { error: "Could not remove the sponsor. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
