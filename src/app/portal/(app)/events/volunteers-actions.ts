"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseVolunteerForm, parseVolunteerHoursForm } from "./volunteers-form";

export type EventVolunteerPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type EventVolunteer = {
  id: string;
  event_id: string;
  person_id: string;
  role: string | null;
  notes: string | null;
  person: EventVolunteerPerson;
};

export type VolunteerActionResult = { error: string } | { success: true };

export async function listEventVolunteersAction(
  eventId: string
): Promise<{ data: EventVolunteer[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_volunteers")
    .select("id, event_id, person_id, role, notes, person:people(id, name, email, phone)")
    .eq("event_id", eventId);

  if (error) {
    return { error: "Could not load volunteers. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventVolunteer[] };
}

export async function createEventVolunteerAction(
  eventId: string,
  personId: string,
  formData: FormData
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a volunteer." };
  }
  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseVolunteerForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_volunteers")
    .insert({ event_id: eventId, person_id: personId, ...parsed.data });

  if (error) {
    if (error.code === "23505") {
      return { error: "This person is already linked to this event as a volunteer." };
    }
    return { error: "Could not save the volunteer. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventVolunteerAction(id: string): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a volunteer." };
  }

  const { error } = await supabase.from("event_volunteers").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove the volunteer. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export type EventVolunteerHours = {
  id: string;
  event_id: string;
  person_id: string;
  hours: number | string;
  logged_date: string;
  notes: string | null;
  person: EventVolunteerPerson;
};

export async function listEventVolunteerHoursAction(
  eventId: string
): Promise<{ data: EventVolunteerHours[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_volunteer_hours")
    .select("id, event_id, person_id, hours, logged_date, notes, person:people(id, name, email, phone)")
    .eq("event_id", eventId)
    .order("logged_date", { ascending: false });

  if (error) {
    return { error: "Could not load volunteer hours. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventVolunteerHours[] };
}

export async function createEventVolunteerHoursAction(
  eventId: string,
  personId: string,
  formData: FormData
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to log hours." };
  }
  if (!personId) {
    return { error: "Select or create a person to log hours for." };
  }

  const parsed = parseVolunteerHoursForm(formData);
  if ("error" in parsed) return parsed;
  const { hours, loggedDate, notes } = parsed.data;

  const { error } = await supabase
    .from("event_volunteer_hours")
    .insert({ event_id: eventId, person_id: personId, hours, logged_date: loggedDate, notes });

  if (error) {
    return { error: "Could not log hours. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventVolunteerHoursAction(id: string): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a logged hours entry." };
  }

  const { error } = await supabase.from("event_volunteer_hours").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove this entry. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
