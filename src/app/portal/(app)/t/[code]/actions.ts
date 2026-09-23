"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupInventoryTag, TAG_PATH_PREFIX } from "@/lib/inventory-tags";
import {
  addToDistributionDraft,
  getCurrentDistributionDraft,
  scanWarning,
} from "@/lib/inventory-distribution-draft";

/**
 * "Add to the distribution" from the tag resolver (#1420 part 3). The code is
 * looked up again under the caller's RLS rather than trusting an item id from
 * the form, and the item goes onto the draft the resolver offered: the one the
 * caller touched last. The draft tables' RLS carries the record-distribution
 * permission, so a reader without it adds nothing.
 */
export async function addTagToCurrentDistributionAction(
  formData: FormData,
): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const back = `${TAG_PATH_PREFIX}${encodeURIComponent(code)}`;
  const supabase = await createSupabaseServerClient();

  const [{ matches }, draft] = await Promise.all([
    lookupInventoryTag(supabase, code, { kinds: ["asset_tag"] }),
    getCurrentDistributionDraft(supabase),
  ]);
  const found = matches[0]?.item;
  if (!found || !draft) redirect(`${back}?added=error`);

  const { data: item } = await supabase
    .from("inventory_items")
    .select("status, intended_use")
    .eq("id", found.id)
    .maybeSingle();
  if (
    !item ||
    scanWarning({ status: item.status, intendedUse: item.intended_use })
  ) {
    redirect(`${back}?added=error`);
  }

  const { error } = await addToDistributionDraft(
    supabase,
    found.id,
    draft.eventId,
  );
  redirect(`${back}?added=${error ? "error" : "1"}`);
}
