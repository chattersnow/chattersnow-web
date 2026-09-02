"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseShiftForm } from "./shifts-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type EventShift = {
  id: string;
  event_id: string;
  label: string;
  starts_at: string;
  ends_at: string;
  target_headcount: number | null;
  notes: string | null;
  volunteer_role_type_id: string | null;
  role_type: { id: string; name: string } | null;
};

export type ShiftActionResult = { error: string } | { success: true };

export async function listEventShiftsAction(
  eventId: string,
): Promise<{ data: EventShift[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_shifts")
    .select(
      "id, event_id, label, starts_at, ends_at, target_headcount, notes, volunteer_role_type_id, role_type:volunteer_role_types(id, name)",
    )
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true });

  if (error) {
    return { error: "Could not load shifts. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventShift[] };
}

export async function createEventShiftAction(
  eventId: string,
  formData: FormData,
): Promise<ShiftActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a shift.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseShiftForm(formData);
  if ("error" in parsed) return parsed;
  const {
    label,
    startsAt,
    endsAt,
    targetHeadcount,
    notes,
    volunteerRoleTypeId,
  } = parsed.data;

  const { error } = await supabase.from("event_shifts").insert({
    event_id: eventId,
    label,
    starts_at: startsAt,
    ends_at: endsAt,
    target_headcount: targetHeadcount,
    notes,
    volunteer_role_type_id: volunteerRoleTypeId,
  });

  if (error) {
    return { error: "Could not save the shift. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventShiftAction(
  id: string,
  formData: FormData,
): Promise<ShiftActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a shift.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseShiftForm(formData);
  if ("error" in parsed) return parsed;
  const {
    label,
    startsAt,
    endsAt,
    targetHeadcount,
    notes,
    volunteerRoleTypeId,
  } = parsed.data;

  const { error } = await supabase
    .from("event_shifts")
    .update({
      label,
      starts_at: startsAt,
      ends_at: endsAt,
      target_headcount: targetHeadcount,
      notes,
      volunteer_role_type_id: volunteerRoleTypeId,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the shift. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventShiftAction(
  id: string,
): Promise<ShiftActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a shift.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("event_shifts").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove the shift. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
