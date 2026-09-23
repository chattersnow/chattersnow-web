"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { MAX_LABEL_ITEMS } from "@/lib/inventory-labels";

/**
 * A batch of blank labels to print before the gear arrives (#1420 part 4):
 * unassigned codes, bound one by one when each is scanned at intake. Allowed
 * to whoever runs the intake table as well as to inventory managers; the
 * function re-checks the same three grants.
 */
export async function createBlankLabelsAction(
  count: number,
): Promise<{ data: string[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  if (!Number.isInteger(count) || count < 1 || count > MAX_LABEL_ITEMS) {
    return { error: `Choose between 1 and ${MAX_LABEL_ITEMS} labels.` };
  }

  const { data, error } = await supabase.rpc("create_blank_asset_tags", {
    p_count: count,
  });
  if (error || !data) {
    return { error: "Could not create the labels. Please try again." };
  }
  return { data: data.map((row) => row.value) };
}
