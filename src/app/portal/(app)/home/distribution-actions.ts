"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RecordDistributionInput } from "./distribution-form";
import {
  recordEventDistribution,
  type DistributionActionResult,
} from "./distribution-core";
import { checkAnyPermission } from "@/lib/auth/permissions";

export type { RecordDistributionInput };
export type { DistributionActionResult } from "./distribution-core";

export type EventDistributionRow = {
  id: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: {
    id: string;
    description: string;
    type: string | null;
    size: string | null;
    inventory_categories?: { key: string; label: string } | null;
  } | null;
};

export type DistributionRow = EventDistributionRow & {
  event: { id: string; name: string } | null;
  recipient: { id: string; name: string | null } | null;
};

export type AvailableInventoryItem = {
  id: string;
  description: string;
  type: string | null;
  inventory_categories?: { key: string; label: string } | null;
};

export async function listEventDistributionsAction(
  eventId: string,
): Promise<{ data: EventDistributionRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("inventory_movements")
    .select(
      "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size, inventory_categories(key, label))",
    )
    .eq("event_id", eventId)
    .eq("movement_type", "distributed")
    .order("occurred_at", { ascending: false });

  if (error) {
    return {
      error: "Could not load distributions for this event. Please try again.",
    };
  }
  return { data: (data ?? []) as unknown as EventDistributionRow[] };
}

export async function listDistributionsAction(
  limit: number = 100,
): Promise<{ data: DistributionRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("inventory_movements")
    .select(
      "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size, inventory_categories(key, label)), event:events(id, name), recipient:people(id, name)",
    )
    .eq("movement_type", "distributed")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: "Could not load distributions. Please try again." };
  }
  return { data: (data ?? []) as unknown as DistributionRow[] };
}

export async function listAvailableInventoryItemsAction(): Promise<
  { data: AvailableInventoryItem[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, description, type, inventory_categories(key, label)")
    .eq("status", "available")
    // Giveaway prizes and internal-use items are not gear-library stock, so
    // they must not be offered as something to distribute to a rider.
    .eq("intended_use", "gear_library")
    .order("description", { ascending: true });

  if (error) {
    return { error: "Could not load available inventory. Please try again." };
  }
  return { data: (data ?? []) as unknown as AvailableInventoryItem[] };
}

/**
 * Web transport for `recordEventDistribution` (#1082 Phase 1). The decision to
 * record lives in distribution-core.ts, which has no Next imports.
 */
export async function recordEventDistributionAction(
  input: RecordDistributionInput,
): Promise<DistributionActionResult> {
  const supabase = await createSupabaseServerClient();
  const result = await recordEventDistribution(supabase, input);
  if ("error" in result) return result;

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/distribution");
  revalidatePath("/portal/events");
  return result;
}
