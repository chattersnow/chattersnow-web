"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DonationItemInput = {
  description: string;
  size?: string;
  type: string;
  gender?: string;
  condition: string;
  faceValue?: number | null;
  notes?: string;
};

export type CreateDonationInput = {
  isAnonymous: boolean;
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  sourceType: string;
  donorNotes?: string;
  items: DonationItemInput[];
  eventId?: string;
};

export type CreateDonationResult = { error: string } | { success: true };

const SOURCE_TYPES = ["individual", "brand", "organization", "event", "other"] as const;
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;

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

  const donorName = input.donorName.trim();
  if (!input.isAnonymous && !donorName) {
    return { error: "Donor name is required unless the donation is anonymous." };
  }
  if (!SOURCE_TYPES.includes(input.sourceType as (typeof SOURCE_TYPES)[number])) {
    return { error: "Select a valid donor source." };
  }
  if (!input.items.length) {
    return { error: "Add at least one item to the donation." };
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const label = `Item ${i + 1}`;
    if (!item.description.trim()) {
      return { error: `${label}: description is required.` };
    }
    if (!item.type.trim()) {
      return { error: `${label}: type is required.` };
    }
    if (!CONDITIONS.includes(item.condition as (typeof CONDITIONS)[number])) {
      return { error: `${label}: select a valid condition.` };
    }
    if (
      item.faceValue != null &&
      (Number.isNaN(item.faceValue) || item.faceValue < 0)
    ) {
      return { error: `${label}: face value must be a positive number.` };
    }
  }

  const { error } = await supabase.rpc("create_donation_with_items", {
    p_donor_name: input.isAnonymous ? null : donorName,
    p_donor_is_anonymous: input.isAnonymous,
    p_donor_source_type: input.sourceType,
    p_donor_email: input.donorEmail?.trim() || null,
    p_donor_phone: input.donorPhone?.trim() || null,
    p_donor_notes: input.donorNotes?.trim() || null,
    p_items: input.items.map((item) => ({
      description: item.description.trim(),
      size: item.size?.trim() || null,
      type: item.type.trim(),
      gender: item.gender || null,
      condition: item.condition,
      face_value: item.faceValue ?? null,
      notes: item.notes?.trim() || null,
    })),
    p_event_id: input.eventId ?? null,
  });

  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory");
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
