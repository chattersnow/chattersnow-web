"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseVolunteerForm,
  parseEventVolunteerHoursForm,
} from "./volunteers-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

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
  shift_id: string | null;
  role: string | null;
  notes: string | null;
  person: EventVolunteerPerson;
};

export type VolunteerActionResult = { error: string } | { success: true };

export async function listEventVolunteersAction(
  eventId: string,
): Promise<{ data: EventVolunteer[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_volunteers")
    .select(
      "id, event_id, person_id, shift_id, role, notes, person:people!inner(id, name, email, phone)",
    )
    .eq("event_id", eventId)
    .order("person(name)", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    return { error: "Could not load volunteers. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventVolunteer[] };
}

export async function createEventVolunteerAction(
  eventId: string,
  personId: string,
  formData: FormData,
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a volunteer.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to link." };
  }

  const parsed = parseVolunteerForm(formData);
  if ("error" in parsed) return parsed;
  const shiftId = String(formData.get("shiftId") ?? "").trim() || null;

  const { error } = await supabase.from("event_volunteers").insert({
    event_id: eventId,
    person_id: personId,
    shift_id: shiftId,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "This person is already linked to this event as a volunteer.",
      };
    }
    return { error: "Could not save the volunteer. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventVolunteerShiftAction(
  id: string,
  shiftId: string | null,
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change a shift assignment.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_volunteers")
    .update({ shift_id: shiftId })
    .eq("id", id);
  if (error) {
    return {
      error: "Could not update the shift assignment. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventVolunteerAction(
  id: string,
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a volunteer.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_volunteers")
    .delete()
    .eq("id", id);
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
  eventId: string,
): Promise<{ data: EventVolunteerHours[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "event_volunteer_hours",
    "view",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_volunteer_hours")
    .select(
      "id, event_id, person_id, hours, logged_date, notes, person:people(id, name, email, phone)",
    )
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
  formData: FormData,
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to log hours.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "event_volunteer_hours", level: "manage" },
    { resource: "volunteer_hours_logging", level: "manage" },
  ]);
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to log hours for." };
  }

  const { data: signup } = await supabase
    .from("event_volunteers")
    .select("id")
    .eq("event_id", eventId)
    .eq("person_id", personId)
    .maybeSingle();
  if (!signup) {
    return {
      error:
        "This person must be signed up as a volunteer for this event before hours can be logged.",
    };
  }

  const parsed = parseEventVolunteerHoursForm(formData);
  if ("error" in parsed) return parsed;
  const { hours, loggedDate, notes } = parsed.data;

  const { error } = await supabase.from("event_volunteer_hours").insert({
    event_id: eventId,
    person_id: personId,
    hours,
    logged_date: loggedDate,
    notes,
  });

  if (error) {
    return { error: "Could not log hours. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventVolunteerHoursAction(
  id: string,
): Promise<VolunteerActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a logged hours entry.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "event_volunteer_hours",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_volunteer_hours")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: "Could not remove this entry. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
