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
  /** Legacy free text, still shown when no role type resolves. */
  role: string | null;
  volunteer_role_type_id: string | null;
  role_type: { name: string } | null;
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
      "id, event_id, person_id, shift_id, role, volunteer_role_type_id, role_type:volunteer_role_types(name), notes, person:people!inner(id, name, email, phone)",
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

// The event-scoped projection of the shared `volunteer_hours` ledger, not a
// table shape: `event_volunteer_hours` was folded into it by
// 20260904010000. Field names and types are unchanged from that table, so
// the Volunteers tab renders it as before -- but the list now also includes
// entries logged for this event from Volunteers > Participation, which has
// no signup requirement, so a listed person may not appear in Signups above.
export type EventVolunteerHours = {
  id: string;
  event_id: string;
  person_id: string;
  hours: number | string;
  logged_date: string;
  notes: string | null;
  volunteer_role_type: { name: string } | null;
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
    .from("volunteer_hours")
    .select(
      "id, event_id, person_id, hours, logged_date, notes, volunteer_role_type:volunteer_role_types(name), person:people(id, name, email, phone)",
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
  const { volunteerRoleTypeId, hours, loggedDate, notes } = parsed.data;

  const { error } = await supabase.from("volunteer_hours").insert({
    event_id: eventId,
    person_id: personId,
    volunteer_role_type_id: volunteerRoleTypeId,
    hours,
    logged_date: loggedDate,
    notes,
  });

  if (error) {
    return { error: "Could not log hours. Please try again." };
  }

  revalidatePath("/portal/events");
  // Same table now backs Volunteers > Participation (20260904010000).
  revalidatePath("/portal/volunteers/participation");
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
    .from("volunteer_hours")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: "Could not remove this entry. Please try again." };
  }

  revalidatePath("/portal/events");
  // Same table now backs Volunteers > Participation (20260904010000).
  revalidatePath("/portal/volunteers/participation");
  return { success: true };
}
