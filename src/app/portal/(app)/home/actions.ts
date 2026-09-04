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

/** Per-colour ticket counts to hand to the donor, when the donation was
 *  recorded against an event whose giveaway has tiers configured. */
export type GiveawayTicketTotal = {
  tier_id: string;
  tier_key: string;
  tier_label: string;
  tier_rank: number;
  quantity: number;
};

export type DonationGiveawayGrant = {
  giveawayId: string;
  totals: GiveawayTicketTotal[];
  /** Items no tier could be resolved for. These earned nothing, so the UI asks
   *  the staffer to classify them rather than quietly under-granting. */
  untieredItemIds: string[];
};

export type CreateDonationResult =
  { error: string } | { success: true; giveaway: DonationGiveawayGrant | null };

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

  const { data, error } = await supabase.rpc(
    "create_donation_with_items",
    parsed.data,
  );

  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/events");

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        donation_id: string;
        giveaway_id: string | null;
        untiered_item_ids: string[] | null;
      }
    | undefined;

  // The donation itself is saved either way, so a failure to read back the
  // ticket totals must not read as a failed donation. Fall back to no grant
  // and let the staffer check the giveaway tab.
  if (!row?.giveaway_id) return { success: true, giveaway: null };

  const { data: totals } = await supabase.rpc("giveaway_ticket_totals", {
    p_giveaway_id: row.giveaway_id,
    p_donation_id: row.donation_id,
    p_sale_id: null,
  });

  return {
    success: true,
    giveaway: {
      giveawayId: row.giveaway_id,
      totals: (totals ?? []) as GiveawayTicketTotal[],
      untieredItemIds: row.untiered_item_ids ?? [],
    },
  };
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
