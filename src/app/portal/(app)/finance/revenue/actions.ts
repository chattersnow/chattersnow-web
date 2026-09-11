"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MERCHANDISE_RETIRED_MESSAGE,
  REVENUE_COLUMNS,
  type RevenueRow,
} from "./revenue-shared";
import { parseRevenueForm } from "./revenue-form";
import { checkPermission } from "@/lib/auth/permissions";

export type RevenueActionResult = { error: string } | { success: true };

/**
 * The `merchandise` source is retired for new rows, enforced by a trigger
 * (20260911060000) rather than by this layer, so a write that slips past the
 * form check still fails -- with a code, which becomes the same sentence the
 * form would have shown.
 */
function revenueWriteError(
  error: { message?: string } | null,
  fallback: string,
): string {
  return error?.message?.trim() === "MERCHANDISE_SOURCE_RETIRED"
    ? MERCHANDISE_RETIRED_MESSAGE
    : fallback;
}

function revalidateRevenuePaths() {
  revalidatePath("/portal/finance/revenue");
  revalidatePath("/portal/events");
}

export async function createRevenueAction(
  formData: FormData,
): Promise<RevenueActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "event_revenue",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseRevenueForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_revenue").insert(parsed.data);
  if (error) {
    return {
      error: revenueWriteError(
        error,
        "Could not save the revenue record. Please try again.",
      ),
    };
  }

  revalidateRevenuePaths();
  return { success: true };
}

export async function updateRevenueAction(
  id: string,
  formData: FormData,
): Promise<RevenueActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "event_revenue",
    "manage",
  );
  if (permissionError) return permissionError;

  // A row already on `merchandise` predates the register and stays editable
  // on that source; anything else may not move onto it.
  const { data: existing } = await supabase
    .from("event_revenue")
    .select("source")
    .eq("id", id)
    .maybeSingle();

  const parsed = parseRevenueForm(formData, {
    allowLegacyMerchandise: existing?.source === "merchandise",
  });
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_revenue")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return {
      error: revenueWriteError(
        error,
        "Could not update the revenue record. Please try again.",
      ),
    };
  }

  revalidateRevenuePaths();
  return { success: true };
}

export async function deleteRevenueAction(
  id: string,
): Promise<RevenueActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "event_revenue",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.from("event_revenue").delete().eq("id", id);
  if (error) {
    return { error: "Could not delete the revenue record. Please try again." };
  }

  revalidateRevenuePaths();
  return { success: true };
}

export async function listEventRevenueAction(
  eventId: string,
): Promise<{ data: RevenueRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "event_revenue",
    "view",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_revenue")
    .select(REVENUE_COLUMNS)
    .eq("event_id", eventId)
    .order("received_date", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    return {
      error: "Could not load revenue for this event. Please try again.",
    };
  }
  return { data: (data ?? []) as unknown as RevenueRow[] };
}
