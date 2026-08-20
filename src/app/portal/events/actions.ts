"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateEventResult = { error: string } | { success: true };

const VISIBILITIES = ["public", "private"] as const;
const STATUSES = ["draft", "published"] as const;

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create an event." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!name) return { error: "Event name is required." };
  if (!startsAt) return { error: "Start date and time are required." };
  if (!timezone) return { error: "Timezone is required." };
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    return { error: "Select a valid visibility." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  const { error } = await supabase.from("events").insert({
    name,
    location: location || null,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
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

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!name) return { error: "Event name is required." };
  if (!startsAt) return { error: "Start date and time are required." };
  if (!timezone) return { error: "Timezone is required." };
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    return { error: "Select a valid visibility." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
  if (endsAtIso && endsAtIso < startsAtIso) {
    return { error: "End time must be after the start time." };
  }

  const { error } = await supabase
    .from("events")
    .update({
      name,
      location: location || null,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
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
