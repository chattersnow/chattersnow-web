"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseGiveawayForm,
  parseGiveawayPrizeForm,
  parseGiveawayWinnerForm,
} from "./giveaway-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type GiveawayWinner = {
  id: string;
  giveaway_prize_id: string;
  winner_name: string;
  winner_contact: string | null;
  distribution_status: string;
  distributed_at: string | null;
  notes: string | null;
};

export type GiveawayPrizeDonor = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type GiveawayPrize = {
  id: string;
  giveaway_id: string;
  prize_name: string;
  donor_person_id: string | null;
  donor: GiveawayPrizeDonor | null;
  estimated_value: number | string | null;
  notes: string | null;
  source_inventory_item_id: string | null;
  source_monetary_donation_id: string | null;
  source_item: { id: string; description: string } | null;
  source_donation: { id: string; amount: number | string } | null;
  giveaway_winners: GiveawayWinner | null;
};

export type AvailableGiveawaySourceDonor = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type AvailableInventoryItemSource = {
  id: string;
  description: string;
  face_value: number | string | null;
  donor: AvailableGiveawaySourceDonor | null;
};

export type AvailableMonetaryDonationSource = {
  id: string;
  amount: number | string;
  donor: AvailableGiveawaySourceDonor | null;
};

export type Giveaway = {
  id: string;
  event_id: string;
  name: string | null;
  tickets_sold: number;
  ticket_price: number | string | null;
  revenue_amount: number | string;
  drawing_date: string | null;
  notes: string | null;
  giveaway_prizes: GiveawayPrize[];
};

export type GiveawayActionResult = { error: string } | { success: true };

export async function getEventGiveawayAction(
  eventId: string,
): Promise<{ data: Giveaway | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("giveaways")
    .select(
      "id, event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, notes, giveaway_prizes(id, giveaway_id, prize_name, donor_person_id, donor:people(id, name, email, phone), estimated_value, notes, source_inventory_item_id, source_monetary_donation_id, giveaway_winners(id, giveaway_prize_id, winner_name, winner_contact, distribution_status, distributed_at, notes))",
    )
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return {
      error: "Could not load the giveaway for this event. Please try again.",
    };
  }

  const giveaway = (data as unknown as Giveaway) ?? null;
  if (!giveaway) return { data: null };

  // giveaway_prizes RLS is scoped to events:*, but inventory_items/
  // monetary_donations are scoped to inventory:*/finance:* -- an
  // event_coordinator can read the source id columns above but not embed
  // those tables directly, so a security-definer RPC resolves the display
  // label for any sourced prize (see 20260830200000).
  const sourcedPrizeIds = giveaway.giveaway_prizes.filter(
    (prize) =>
      prize.source_inventory_item_id || prize.source_monetary_donation_id,
  );
  if (sourcedPrizeIds.length > 0) {
    const { data: sources } = await supabase.rpc("get_giveaway_prize_sources", {
      p_giveaway_id: giveaway.id,
    });
    const sourcesByPrizeId = new Map(
      (
        (sources ?? []) as {
          id: string;
          source_item: { id: string; description: string } | null;
          source_donation: { id: string; amount: number | string } | null;
        }[]
      ).map((source) => [source.id, source]),
    );
    giveaway.giveaway_prizes = giveaway.giveaway_prizes.map((prize) => ({
      ...prize,
      source_item: sourcesByPrizeId.get(prize.id)?.source_item ?? null,
      source_donation: sourcesByPrizeId.get(prize.id)?.source_donation ?? null,
    }));
  } else {
    giveaway.giveaway_prizes = giveaway.giveaway_prizes.map((prize) => ({
      ...prize,
      source_item: null,
      source_donation: null,
    }));
  }

  return { data: giveaway };
}

export async function upsertEventGiveawayAction(
  eventId: string,
  formData: FormData,
): Promise<GiveawayActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the giveaway.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseGiveawayForm(formData);
  if ("error" in parsed) return parsed;
  const { name, ticketsSold, ticketPrice, revenueAmount, drawingDate, notes } =
    parsed.data;

  const { error } = await supabase.from("giveaways").upsert(
    {
      event_id: eventId,
      name,
      tickets_sold: ticketsSold,
      ticket_price: ticketPrice,
      revenue_amount: revenueAmount,
      drawing_date: drawingDate,
      notes,
    },
    { onConflict: "event_id" },
  );

  if (error) {
    return { error: "Could not save the giveaway. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function createGiveawayPrizeAction(
  giveawayId: string,
  donorPersonId: string | null,
  formData: FormData,
  sourceInventoryItemId: string | null = null,
  sourceMonetaryDonationId: string | null = null,
): Promise<GiveawayActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a prize.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseGiveawayPrizeForm(formData);
  if ("error" in parsed) return parsed;
  const { prizeName, estimatedValue, notes } = parsed.data;

  const { error } = await supabase.from("giveaway_prizes").insert({
    giveaway_id: giveawayId,
    prize_name: prizeName,
    donor_person_id: donorPersonId,
    estimated_value: estimatedValue,
    notes,
    source_inventory_item_id: sourceInventoryItemId,
    source_monetary_donation_id: sourceMonetaryDonationId,
  });

  if (error) {
    return { error: "Could not save the prize. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function listAvailableGiveawaySourcesAction(
  eventId: string,
): Promise<
  | {
      data: {
        inventoryItems: AvailableInventoryItemSource[];
        monetaryDonations: AvailableMonetaryDonationSource[];
      };
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc(
    "list_available_giveaway_sources",
    { p_event_id: eventId },
  );

  if (error) {
    return { error: "Could not load available donations. Please try again." };
  }

  const result = data as {
    inventoryItems: AvailableInventoryItemSource[];
    monetaryDonations: AvailableMonetaryDonationSource[];
  };

  return { data: result };
}

export async function deleteGiveawayPrizeAction(
  id: string,
): Promise<GiveawayActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a prize.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("giveaway_prizes")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: "Could not remove the prize. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function upsertGiveawayWinnerAction(
  prizeId: string,
  formData: FormData,
): Promise<GiveawayActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a winner.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseGiveawayWinnerForm(formData);
  if ("error" in parsed) return parsed;
  const {
    winnerName,
    winnerContact,
    distributionStatus,
    distributedAt,
    notes,
  } = parsed.data;

  const { error } = await supabase.from("giveaway_winners").upsert(
    {
      giveaway_prize_id: prizeId,
      winner_name: winnerName,
      winner_contact: winnerContact,
      distribution_status: distributionStatus,
      distributed_at: distributedAt,
      notes,
    },
    { onConflict: "giveaway_prize_id" },
  );

  if (error) {
    return { error: "Could not save the winner. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
