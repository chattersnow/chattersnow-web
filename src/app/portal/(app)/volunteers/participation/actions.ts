"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseParticipationHoursForm } from "./hours-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";

export type VolunteerHoursPerson = { id: string; name: string | null };
export type VolunteerHoursEvent = { id: string; name: string } | null;
export type VolunteerHoursRoleType = { id: string; name: string } | null;

export type VolunteerHoursEntry = {
  id: string;
  hours: number | string;
  logged_date: string;
  notes: string | null;
  person: VolunteerHoursPerson;
  event: VolunteerHoursEvent;
  volunteer_role_type: VolunteerHoursRoleType;
};

export type VolunteerHoursActionResult = { error: string } | { success: true };

export async function listVolunteerHoursAction(): Promise<
  { data: VolunteerHoursEntry[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "volunteers", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("volunteer_hours")
    .select(
      "id, hours, logged_date, notes, person:people(id, name), event:events(id, name), volunteer_role_type:volunteer_role_types(id, name)",
    )
    .order("logged_date", { ascending: false });

  if (error) {
    return { error: "Could not load volunteer hours. Please try again." };
  }
  return { data: (data ?? []) as unknown as VolunteerHoursEntry[] };
}

export async function createVolunteerHoursAction(
  personId: string,
  formData: FormData,
): Promise<VolunteerHoursActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to log hours." };
  }
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "volunteers", level: "manage" },
    { resource: "volunteer_hours_logging", level: "manage" },
  ]);
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to log hours for." };
  }

  const parsed = parseParticipationHoursForm(formData);
  if ("error" in parsed) return parsed;
  const { eventId, volunteerRoleTypeId, hours, loggedDate, notes } =
    parsed.data;

  const { error } = await supabase.from("volunteer_hours").insert({
    person_id: personId,
    event_id: eventId,
    volunteer_role_type_id: volunteerRoleTypeId,
    hours,
    logged_date: loggedDate,
    notes,
  });

  if (error) {
    return { error: "Could not log hours. Please try again." };
  }

  revalidatePath("/portal/volunteers/participation");
  return { success: true };
}

export async function updateVolunteerHoursAction(
  id: string,
  personId: string,
  formData: FormData,
): Promise<VolunteerHoursActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update a logged hours entry." };
  }
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!personId) {
    return { error: "Select or create a person to log hours for." };
  }

  const parsed = parseParticipationHoursForm(formData);
  if ("error" in parsed) return parsed;
  const { eventId, volunteerRoleTypeId, hours, loggedDate, notes } =
    parsed.data;

  const { error } = await supabase
    .from("volunteer_hours")
    .update({
      person_id: personId,
      event_id: eventId,
      volunteer_role_type_id: volunteerRoleTypeId,
      hours,
      logged_date: loggedDate,
      notes,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this entry. Please try again." };
  }

  revalidatePath("/portal/volunteers/participation");
  return { success: true };
}

export async function deleteVolunteerHoursAction(
  id: string,
): Promise<VolunteerHoursActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a logged hours entry." };
  }
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
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

  revalidatePath("/portal/volunteers/participation");
  return { success: true };
}

export type EventOption = { id: string; name: string };

export async function listEventOptionsAction(): Promise<
  { data: EventOption[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "volunteers", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false });

  if (error) {
    return { error: "Could not load events. Please try again." };
  }
  return { data: (data ?? []) as EventOption[] };
}
