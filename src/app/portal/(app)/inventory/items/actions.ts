"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInventoryItemForm } from "./inventory-item-form";
import { checkAnyPermission, checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseLabelOptions } from "@/lib/inventory-labels";

export type UpdateInventoryItemResult = { error: string } | { success: true };

export async function updateInventoryItemAction(
  id: string,
  formData: FormData,
): Promise<UpdateInventoryItemResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update an item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseInventoryItemForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("inventory_items")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: "Could not save the item. Please try again." };
  }

  revalidatePath("/portal/inventory/items");
  return { success: true };
}

export type CreateAssetTagsResult = { error: string } | { created: number };

/**
 * Give each of these items an asset-tag code if it has none yet (#1420 part
 * 2), so its label can be printed. Items received before tagging existed have
 * no code; intake will create one in the same transaction from part 4 on.
 *
 * The codes themselves come from the insert trigger: an `asset_tag` row with
 * an empty value is given a generated one. Writing a tag is editing the item,
 * so this is `inventory:manage`, the same as the table's insert policy.
 */
export async function createAssetTagsAction(
  itemIds: string[],
): Promise<CreateAssetTagsResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create tag codes.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  // The print page's own parser, so the action accepts exactly the ids the
  // page could have shown: uuids only, de-duplicated, capped.
  const ids = parseLabelOptions({ items: itemIds.join(",") }).itemIds;
  if (ids.length === 0) return { created: 0 };

  const { data: tagged, error: readError } = await supabase
    .from("inventory_item_tags")
    .select("item_id")
    .eq("kind", "asset_tag")
    .in("item_id", ids);
  if (readError)
    return { error: "Could not create the codes. Please try again." };

  const hasCode = new Set((tagged ?? []).map((tag) => tag.item_id));
  const missing = ids.filter((id) => !hasCode.has(id));
  if (missing.length === 0) return { created: 0 };

  const { error } = await supabase
    .from("inventory_item_tags")
    .insert(
      missing.map((id) => ({ item_id: id, kind: "asset_tag", value: "" })),
    );
  if (error) {
    // 23505: someone else gave one of these items a code a moment ago (one
    // asset tag per item). Nothing is lost; the page reloads with theirs.
    return {
      error:
        error.code === "23505"
          ? "Some of these items were just given codes. Reload and try again."
          : "Could not create the codes. Please try again.",
    };
  }

  revalidatePath("/portal/inventory/items");
  return { created: missing.length };
}
