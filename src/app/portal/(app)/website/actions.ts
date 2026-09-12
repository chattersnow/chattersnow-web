"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { contentSlot, isValidSlotValue } from "@/lib/site-content";

export type SiteContentActionResult = { error: string } | { success: true };

export type SiteContentEntry = { key: string; value: unknown };

/**
 * Stages the slots the editor changed as drafts (#793).
 *
 * Saving is no longer publishing: this writes `draft_value`, which nothing on
 * the public site reads. Every value is still checked against the registry
 * first -- the public site reads the published rows with no session behind it,
 * so a malformed value must be refused here rather than discovered by a
 * visitor -- and a `null` value is the "back to the registry default" draft.
 *
 * The write goes through an RPC because `site_content` is not writable by
 * `authenticated` at all; see the migration for why.
 */
export async function saveSiteContentDraftAction(
  entries: SiteContentEntry[],
): Promise<SiteContentActionResult> {
  if (entries.length === 0) return { success: true };

  for (const entry of entries) {
    const slot = contentSlot(entry.key);
    if (!slot) return { error: `Unknown content slot: ${entry.key}` };
    if (entry.value !== null && !isValidSlotValue(slot, entry.value)) {
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

  const { error } = await supabase.rpc("save_site_content_drafts", {
    p_entries: entries.map((entry) => ({
      key: entry.key,
      value: entry.value ?? null,
    })),
  });
  if (error) {
    return { error: "Could not save the draft. Please try again." };
  }

  // The portal reads its own writes; the public site is untouched until
  // publish, so nothing there needs revalidating.
  revalidatePath("/portal/website");
  return { success: true };
}

/** Drops the pending drafts for these slots, leaving what is published alone. */
export async function discardSiteContentDraftAction(
  keys: string[],
): Promise<SiteContentActionResult> {
  if (keys.length === 0) return { success: true };

  for (const key of keys) {
    if (!contentSlot(key)) return { error: `Unknown content slot: ${key}` };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("discard_site_content_drafts", {
    p_keys: keys,
  });
  if (error) {
    return { error: "Could not discard the draft. Please try again." };
  }

  revalidatePath("/portal/website");
  return { success: true };
}

/**
 * Publishes the named slots' drafts to the public site.
 *
 * The one call that changes what a visitor sees, which is why it is also where
 * the approval gate for the legal documents will sit.
 */
export async function publishSiteContentAction(
  keys: string[],
): Promise<SiteContentActionResult> {
  if (keys.length === 0) return { success: true };

  for (const key of keys) {
    if (!contentSlot(key)) return { error: `Unknown content slot: ${key}` };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("publish_site_content", {
    p_keys: keys,
  });
  if (error) {
    return { error: "Could not publish this content. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
