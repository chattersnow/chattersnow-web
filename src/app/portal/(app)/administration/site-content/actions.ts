"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { contentSlot, isValidSlotValue } from "@/lib/site-content";

export type SiteContentActionResult = { error: string } | { success: true };

export type SiteContentEntry = { key: string; value: unknown };

/**
 * Writes the slots the editor changed (#707 Phase 4). Every value is checked
 * against the registry before it is stored: the public site reads these
 * rows with no session behind it, so a malformed value must be refused here
 * rather than discovered by a visitor.
 */
export async function saveSiteContentAction(
  entries: SiteContentEntry[],
): Promise<SiteContentActionResult> {
  if (entries.length === 0) return { success: true };

  for (const entry of entries) {
    const slot = contentSlot(entry.key);
    if (!slot) return { error: `Unknown content slot: ${entry.key}` };
    if (!isValidSlotValue(slot, entry.value)) {
      return { error: `${slot.label} has the wrong shape and was not saved.` };
    }
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("site_content")
    .upsert(entries, { onConflict: "tenant_id,key" });
  if (error) {
    return { error: "Could not save the content. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/** Drops a slot's row so the page renders the registry default again. */
export async function resetSiteContentAction(
  key: string,
): Promise<SiteContentActionResult> {
  if (!contentSlot(key)) return { error: `Unknown content slot: ${key}` };

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.from("site_content").delete().eq("key", key);
  if (error) {
    return { error: "Could not reset this content. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
