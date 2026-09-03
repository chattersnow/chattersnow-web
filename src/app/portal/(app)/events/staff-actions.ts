"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEventStaffForm } from "./staff-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type EventStaffPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type EventStaffMember = {
  id: string;
  event_id: string;
  person_id: string;
  role: string | null;
  notes: string | null;
  person: EventStaffPerson;
};

export type EventStaffActionResult = { error: string } | { success: true };

export async function listEventStaffAction(
  eventId: string,
): Promise<{ data: EventStaffMember[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_staff")
    .select(
      "id, event_id, person_id, role, notes, person:people(id, name, email, phone)",
    )
    .eq("event_id", eventId);

  if (error) {
    return { error: "Could not load staff. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventStaffMember[] };
}

export async function createEventStaffAction(
  eventId: string,
  personId: string,
  formData: FormData,
): Promise<EventStaffActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add staff.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseEventStaffForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_staff").insert({
    event_id: eventId,
    person_id: personId,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "This person is already assigned to this event as staff.",
      };
    }
    return { error: "Could not save the staff assignment. Please try again." };
  }

  revalidatePath("/portal/events");
  revalidatePath("/portal/staff");
  return { success: true };
}

export async function updateEventStaffAction(
  id: string,
  formData: FormData,
): Promise<EventStaffActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a staff assignment.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseEventStaffForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_staff")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return {
      error: "Could not update the staff assignment. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventStaffAction(
  id: string,
): Promise<EventStaffActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove staff.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("event_staff").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove the staff member. Please try again." };
  }

  revalidatePath("/portal/events");
  // The Staff segment is derived from these rows, so removing the last one
  // takes the person off it.
  revalidatePath("/portal/staff");
  return { success: true };
}
