"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventDistributionRow = {
  id: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: { id: string; description: string; type: string; size: string | null } | null;
};

export type DistributionActionResult = { error: string } | { success: true };

export async function listEventDistributionsAction(
  eventId: string
): Promise<{ data: EventDistributionRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size)")
    .eq("event_id", eventId)
    .eq("movement_type", "distributed")
    .order("occurred_at", { ascending: false });

  if (error) {
    return { error: "Could not load distributions for this event. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventDistributionRow[] };
}

export async function listAvailableInventoryItemsAction(): Promise<
  { data: { id: string; description: string; type: string }[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, description, type")
    .eq("status", "available")
    .order("description", { ascending: true });

  if (error) {
    return { error: "Could not load available inventory. Please try again." };
  }
  return { data: data ?? [] };
}

export async function recordEventDistributionAction(
  eventId: string,
  formData: FormData
): Promise<DistributionActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record a distribution." };
  }

  const inventoryItemId = String(formData.get("inventoryItemId") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const markDistributed = formData.get("markDistributed") !== "off";

  if (!inventoryItemId) {
    return { error: "Select an inventory item." };
  }

  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }

  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw).toISOString() : new Date().toISOString();

  const { error } = await supabase.rpc("record_event_distribution", {
    p_inventory_item_id: inventoryItemId,
    p_event_id: eventId,
    p_quantity: quantity,
    p_reason: reason || null,
    p_occurred_at: occurredAt,
    p_mark_item_distributed: markDistributed,
  });

  if (error) {
    return { error: "Could not record the distribution. Please try again." };
  }

  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/events");
  return { success: true };
}
