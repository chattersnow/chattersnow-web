"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEventAttendanceForm, parseEventForm } from "./event-form";

export type CreateEventResult = { error: string } | { success: true };

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create an event." };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const { name, location, startsAt, endsAt, timezone, visibility, status } = parsed.data;

  const { error } = await supabase.from("events").insert({
    name,
    location,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    visibility,
    status,
  });

  if (error) {
    return { error: "Could not create the event. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAttendanceAction(
  id: string,
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update attendance." };
  }

  const parsed = parseEventAttendanceForm(formData);
  if ("error" in parsed) return parsed;
  const { attendanceCount, attendanceNotes } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      attendance_count: attendanceCount,
      attendance_notes: attendanceNotes,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update attendance. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventAction(
  id: string,
  formData: FormData
): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update an event." };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) return parsed;
  const { name, location, startsAt, endsAt, timezone, visibility, status } = parsed.data;

  const { error } = await supabase
    .from("events")
    .update({
      name,
      location,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone,
      visibility,
      status,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update the event. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}
