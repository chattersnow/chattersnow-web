"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { parseTagIds } from "@/lib/inventory-codes";

/**
 * Records that these codes' labels went to print (#1450), so the Codes page
 * can say when each was last printed. Called by the print button just before
 * the dialog opens, and by the Katasymbol panel after it prints or saves its
 * images -- never by opening a print view. The labels print whether or not
 * this succeeds.
 *
 * Every label page calls it, including the intake label page, so it answers
 * to the grants those pages do; the function re-checks the same three.
 */
export async function recordLabelsPrintedAction(
  tagIds: readonly string[],
): Promise<{ recorded: number } | { error: string }> {
  const ids = parseTagIds(tagIds);
  if (ids.length === 0) return { recorded: 0 };

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "view" },
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc(
    "record_inventory_labels_printed",
    { p_tag_ids: ids },
  );
  if (error) return { error: "Could not record the printing." };
  return { recorded: data ?? 0 };
}
