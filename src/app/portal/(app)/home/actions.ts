"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDonationInput, type CreateDonationInput, type DonationItemInput } from "./donation-form";

export type { CreateDonationInput, DonationItemInput };

export type CreateDonationResult = { error: string } | { success: true };

export async function createDonationAction(
  input: CreateDonationInput
): Promise<CreateDonationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record a donation." };
  }

  const parsed = parseDonationInput(input);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("create_donation_with_items", parsed.data);

  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/events");
  return { success: true };
}

export type EventDonationRow = {
  id: string;
  donated_at: string;
  notes: string | null;
  donor: { name: string | null; is_anonymous: boolean } | null;
  inventory_items: {
    id: string;
    description: string;
    type: string;
    size: string | null;
    condition: string;
    face_value: number | string | null;
    status: string;
  }[];
};

export async function listEventDonationsAction(
  eventId: string
): Promise<{ data: EventDonationRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("donations")
    .select(
      "id, donated_at, notes, donor:people(name, is_anonymous), inventory_items(id, description, type, size, condition, face_value, status)"
    )
    .eq("event_id", eventId)
    .order("donated_at", { ascending: false });

  if (error) {
    return { error: "Could not load donations for this event. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventDonationRow[] };
}
