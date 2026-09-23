"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { getRequestHost } from "@/lib/request-origin";
import { lookupInventoryTag } from "@/lib/inventory-tags";

export type FoundItem = { id: string; description: string; status: string };

/**
 * "Scan a tag" from the command palette or the items toolbar (#1420 part 3):
 * which item(s) a scanned string identifies, so the reader can open one. Gated
 * like the items page itself; the lookup runs under the reader's RLS, so a
 * code they may not see answers exactly like an unknown one.
 */
export async function findScannedItemsAction(
  scanned: string,
): Promise<{ data: FoundItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "inventory", "view");
  if (permissionError) return permissionError;

  const { matches, error } = await lookupInventoryTag(supabase, scanned, {
    host: await getRequestHost(),
  });
  if (error) return { error: "Could not look up that scan. Please try again." };

  const seen = new Set<string>();
  const data: FoundItem[] = [];
  for (const match of matches) {
    if (!match.item || seen.has(match.item.id)) continue;
    seen.add(match.item.id);
    data.push(match.item);
  }
  return { data };
}
