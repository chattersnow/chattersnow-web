"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseDonationInput,
  type CreateDonationInput,
  type DonationItemInput,
} from "./donation-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type { CreateDonationInput, DonationItemInput };

export type CreateDonationResult = { error: string } | { success: true };

export async function createDonationAction(
  input: CreateDonationInput,
): Promise<CreateDonationResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a donation.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseDonationInput(input);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc(
    "create_donation_with_items",
    parsed.data,
  );

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
  eventId: string,
): Promise<{ data: EventDonationRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("donations")
    .select(
      "id, donated_at, notes, donor:people(name, is_anonymous), inventory_items(id, description, type, size, condition, face_value, status)",
    )
    .eq("event_id", eventId)
    .order("donated_at", { ascending: false })
    .order("id", { ascending: true })
    .order("id", { referencedTable: "inventory_items", ascending: true });

  if (error) {
    return {
      error: "Could not load donations for this event. Please try again.",
    };
  }
  return { data: (data ?? []) as unknown as EventDonationRow[] };
}

export async function listRecentDonationsAction(
  limit: number,
): Promise<{ data: EventDonationRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("donations")
    .select(
      "id, donated_at, notes, donor:people(name, is_anonymous), inventory_items(id, description, type, size, condition, face_value, status)",
    )
    .order("donated_at", { ascending: false })
    .order("id", { ascending: true })
    .order("id", { referencedTable: "inventory_items", ascending: true })
    .limit(limit);

  if (error) {
    return { error: "Could not load recent donations. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventDonationRow[] };
}
