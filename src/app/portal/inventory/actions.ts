"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UpdateInventoryItemResult = { error: string } | { success: true };

const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const STATUSES = [
  "available",
  "distributed",
  "damaged",
  "lost",
  "retired",
  "other",
] as const;

export async function updateInventoryItemAction(
  id: string,
  formData: FormData
): Promise<UpdateInventoryItemResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update an item." };
  }

  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!description) {
    return { error: "Item description is required." };
  }
  if (!type) {
    return { error: "Item type is required." };
  }
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) {
    return { error: "Select a valid item condition." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid item status." };
  }

  const faceValueRaw = formData.get("faceValue");
  const faceValue = faceValueRaw ? Number(faceValueRaw) : null;
  if (faceValueRaw && (Number.isNaN(faceValue) || (faceValue as number) < 0)) {
    return { error: "Face value must be a positive number." };
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({
      description,
      type,
      size: String(formData.get("size") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "") || null,
      condition,
      face_value: faceValue,
      status,
      photo_url: String(formData.get("photoUrl") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not save the item. Please try again." };
  }

  revalidatePath("/portal/inventory");
  return { success: true };
}
