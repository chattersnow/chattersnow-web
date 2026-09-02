"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInventoryItemForm } from "./inventory-item-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

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
