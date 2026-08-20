"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RaffleWinner = {
  id: string;
  raffle_prize_id: string;
  winner_name: string;
  winner_contact: string | null;
  distribution_status: string;
  distributed_at: string | null;
  notes: string | null;
};

export type RafflePrize = {
  id: string;
  raffle_id: string;
  prize_name: string;
  donor_name: string | null;
  estimated_value: number | string | null;
  notes: string | null;
  raffle_winners: RaffleWinner[];
};

export type Raffle = {
  id: string;
  event_id: string;
  name: string | null;
  tickets_sold: number;
  ticket_price: number | string | null;
  revenue_amount: number | string;
  drawing_date: string | null;
  notes: string | null;
  raffle_prizes: RafflePrize[];
};

export type RaffleActionResult = { error: string } | { success: true };

export async function getEventRaffleAction(
  eventId: string
): Promise<{ data: Raffle | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("raffles")
    .select(
      "id, event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, notes, raffle_prizes(id, raffle_id, prize_name, donor_name, estimated_value, notes, raffle_winners(id, raffle_prize_id, winner_name, winner_contact, distribution_status, distributed_at, notes))"
    )
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load the raffle for this event. Please try again." };
  }
  return { data: (data as unknown as Raffle) ?? null };
}

export async function upsertEventRaffleAction(
  eventId: string,
  formData: FormData
): Promise<RaffleActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update the raffle." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const ticketsSoldRaw = String(formData.get("ticketsSold") ?? "0").trim();
  const ticketPriceRaw = String(formData.get("ticketPrice") ?? "").trim();
  const revenueRaw = String(formData.get("revenueAmount") ?? "0").trim();
  const drawingDateRaw = String(formData.get("drawingDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const ticketsSold = Number(ticketsSoldRaw);
  if (!Number.isInteger(ticketsSold) || ticketsSold < 0) {
    return { error: "Tickets sold must be a whole number of 0 or more." };
  }

  const revenueAmount = Number(revenueRaw);
  if (!Number.isFinite(revenueAmount) || revenueAmount < 0) {
    return { error: "Revenue must be a positive number." };
  }

  let ticketPrice: number | null = null;
  if (ticketPriceRaw) {
    ticketPrice = Number(ticketPriceRaw);
    if (!Number.isFinite(ticketPrice) || ticketPrice < 0) {
      return { error: "Ticket price must be a positive number." };
    }
  }

  const { error } = await supabase.from("raffles").upsert(
    {
      event_id: eventId,
      name: name || null,
      tickets_sold: ticketsSold,
      ticket_price: ticketPrice,
      revenue_amount: revenueAmount,
      drawing_date: drawingDateRaw ? new Date(drawingDateRaw).toISOString() : null,
      notes: notes || null,
    },
    { onConflict: "event_id" }
  );

  if (error) {
    return { error: "Could not save the raffle. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function createRafflePrizeAction(
  raffleId: string,
  formData: FormData
): Promise<RaffleActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a prize." };
  }

  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const donorName = String(formData.get("donorName") ?? "").trim();
  const estimatedValueRaw = String(formData.get("estimatedValue") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!prizeName) return { error: "Prize name is required." };

  let estimatedValue: number | null = null;
  if (estimatedValueRaw) {
    estimatedValue = Number(estimatedValueRaw);
    if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
      return { error: "Estimated value must be a positive number." };
    }
  }

  const { error } = await supabase.from("raffle_prizes").insert({
    raffle_id: raffleId,
    prize_name: prizeName,
    donor_name: donorName || null,
    estimated_value: estimatedValue,
    notes: notes || null,
  });

  if (error) {
    return { error: "Could not save the prize. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteRafflePrizeAction(id: string): Promise<RaffleActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove a prize." };
  }

  const { error } = await supabase.from("raffle_prizes").delete().eq("id", id);
  if (error) {
    return { error: "Could not remove the prize. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function upsertRaffleWinnerAction(
  prizeId: string,
  formData: FormData
): Promise<RaffleActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record a winner." };
  }

  const winnerName = String(formData.get("winnerName") ?? "").trim();
  const winnerContact = String(formData.get("winnerContact") ?? "").trim();
  const distributionStatus = String(formData.get("distributionStatus") ?? "pending");
  const distributedAtRaw = String(formData.get("distributedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!winnerName) return { error: "Winner name is required." };

  const { error } = await supabase.from("raffle_winners").upsert(
    {
      raffle_prize_id: prizeId,
      winner_name: winnerName,
      winner_contact: winnerContact || null,
      distribution_status: distributionStatus,
      distributed_at: distributedAtRaw ? new Date(distributedAtRaw).toISOString() : null,
      notes: notes || null,
    },
    { onConflict: "raffle_prize_id" }
  );

  if (error) {
    return { error: "Could not save the winner. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
