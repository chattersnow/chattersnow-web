"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreateDonationInput, DonationItemInput } from "./donation-form";
import { createDonation, type CreateDonationResult } from "./donation-core";
import { checkPermission } from "@/lib/auth/permissions";

export type { CreateDonationInput, DonationItemInput };
export type {
  CreateDonationResult,
  DonationGiveawayGrant,
  GiveawayTicketTotal,
} from "./donation-core";

/**
 * Web transport for `createDonation` (#1082 Phase 1). Everything that decides
 * whether the donation is recorded lives in donation-core.ts, which has no
 * Next imports; this adds the one thing that is Next's and only Next's.
 */
export async function createDonationAction(
  input: CreateDonationInput,
): Promise<CreateDonationResult> {
  const supabase = await createSupabaseServerClient();
  const result = await createDonation(supabase, input);
  if ("error" in result) return result;

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/events");

  return result;
}

export type GiveawayTierOption = {
  id: string;
  key: string;
  label: string;
  rank: number;
};

/**
 * Tiers for the giveaway attached to an event, if it has one that's been set
 * up. Drives the optional per-item tier picker at intake: the server falls back
 * to the giveaway's keyword hints when the staffer leaves it unset, so an empty
 * list here just means "this event has no tiered giveaway" and the picker is
 * hidden entirely.
 */
export async function listEventGiveawayTiersAction(
  eventId: string,
): Promise<{ data: GiveawayTierOption[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("giveaways")
    .select("id, giveaway_tiers(id, key, label, rank)")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load giveaway tiers. Please try again." };
  }

  const tiers = (data?.giveaway_tiers ?? []) as GiveawayTierOption[];
  return { data: [...tiers].sort((a, b) => a.rank - b.rank) };
}

export type EventDonationRow = {
  id: string;
  donated_at: string;
  notes: string | null;
  donor: { name: string | null; is_anonymous: boolean } | null;
  inventory_items: {
    id: string;
    description: string;
    type: string | null;
    size: string | null;
    condition: string;
    face_value: number | string | null;
    status: string;
    inventory_categories?: { key: string; label: string } | null;
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
      "id, donated_at, notes, donor:people(name, is_anonymous), inventory_items(id, description, type, size, condition, face_value, status, inventory_categories(key, label))",
    )
    .eq("event_id", eventId)
    // See the donations list page: `donated_at` is a day, so it ties.
    .order("donated_at", { ascending: false })
    .order("created_at", { ascending: false })
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
      "id, donated_at, notes, donor:people(name, is_anonymous), inventory_items(id, description, type, size, condition, face_value, status, inventory_categories(key, label))",
    )
    // The tiebreaker matters most here: `donated_at` ties per day and this
    // query takes only `limit` rows, so without it a donation entered seconds
    // ago can be missing from the dashboard altogether.
    .order("donated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .order("id", { referencedTable: "inventory_items", ascending: true })
    .limit(limit);

  if (error) {
    return { error: "Could not load recent donations. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventDonationRow[] };
}
