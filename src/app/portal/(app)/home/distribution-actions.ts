"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseDistributionInput,
  type RecordDistributionInput,
} from "./distribution-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type { RecordDistributionInput };

export type EventDistributionRow = {
  id: string;
  quantity: number;
  occurred_at: string;
  reason: string | null;
  inventory_item: {
    id: string;
    description: string;
    type: string;
    size: string | null;
  } | null;
};

export type DistributionRow = EventDistributionRow & {
  event: { id: string; name: string } | null;
  recipient: { id: string; name: string | null } | null;
};

export type DistributionActionResult = { error: string } | { success: true };

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
      "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size)",
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
      "id, quantity, occurred_at, reason, inventory_item:inventory_items(id, description, type, size), event:events(id, name), recipient:people(id, name)",
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
  | { data: { id: string; description: string; type: string }[] }
  | { error: string }
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
    // Giveaway prizes and internal-use items are not gear-library stock, so
    // they must not be offered as something to distribute to a rider.
    .eq("intended_use", "gear_library")
    .order("description", { ascending: true });

  if (error) {
    return { error: "Could not load available inventory. Please try again." };
  }
  return { data: data ?? [] };
}

export async function recordEventDistributionAction(
  input: RecordDistributionInput,
): Promise<DistributionActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a distribution.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseDistributionInput(input);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc(
    "record_event_distribution",
    parsed.data,
  );

  if (error) {
    return { error: "Could not record the distribution. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/distribution");
  revalidatePath("/portal/events");
  return { success: true };
}
