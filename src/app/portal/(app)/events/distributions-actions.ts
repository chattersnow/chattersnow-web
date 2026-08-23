"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDistributionForm } from "./distribution-form";
import { checkAnyPermission } from "@/lib/auth/permissions";

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
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

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
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

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
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseDistributionForm(formData);
  if ("error" in parsed) return parsed;
  const { inventoryItemId, quantity, reason, occurredAt, markDistributed } = parsed.data;

  const { error } = await supabase.rpc("record_event_distribution", {
    p_inventory_item_id: inventoryItemId,
    p_event_id: eventId,
    p_quantity: quantity,
    p_reason: reason,
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
