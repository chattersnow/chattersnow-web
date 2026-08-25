"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REVENUE_COLUMNS, type RevenueRow } from "./revenue-shared";
import { parseRevenueForm } from "./revenue-form";
import { checkPermission } from "@/lib/auth/permissions";

export type RevenueActionResult = { error: string } | { success: true };

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
    return { error: "Could not save the revenue record. Please try again." };
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

  const parsed = parseRevenueForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_revenue")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return { error: "Could not update the revenue record. Please try again." };
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
    .order("received_date", { ascending: false });

  if (error) {
    return {
      error: "Could not load revenue for this event. Please try again.",
    };
  }
  return { data: (data ?? []) as unknown as RevenueRow[] };
}
