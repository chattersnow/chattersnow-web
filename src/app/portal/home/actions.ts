"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateDonationResult = { error: string } | { success: true };

const SOURCE_TYPES = ["individual", "brand", "organization", "event", "other"] as const;
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;

export async function createDonationAction(
  formData: FormData
): Promise<CreateDonationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record a donation." };
  }

  const isAnonymous = formData.get("isAnonymous") === "on";
  const donorName = String(formData.get("donorName") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "");
  const itemDescription = String(formData.get("itemDescription") ?? "").trim();
  const itemType = String(formData.get("itemType") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");

  if (!isAnonymous && !donorName) {
    return { error: "Donor name is required unless the donation is anonymous." };
  }
  if (!SOURCE_TYPES.includes(sourceType as (typeof SOURCE_TYPES)[number])) {
    return { error: "Select a valid donor source." };
  }
  if (!itemDescription) {
    return { error: "Item description is required." };
  }
  if (!itemType) {
    return { error: "Item type is required." };
  }
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) {
    return { error: "Select a valid item condition." };
  }

  const faceValueRaw = formData.get("faceValue");
  const faceValue = faceValueRaw ? Number(faceValueRaw) : null;
  if (faceValueRaw && (Number.isNaN(faceValue) || (faceValue as number) < 0)) {
    return { error: "Face value must be a positive number." };
  }

  const { error } = await supabase.rpc("create_donation_with_item", {
    p_donor_name: isAnonymous ? null : donorName,
    p_donor_is_anonymous: isAnonymous,
    p_donor_source_type: sourceType,
    p_donor_email: String(formData.get("donorEmail") ?? "").trim() || null,
    p_donor_phone: String(formData.get("donorPhone") ?? "").trim() || null,
    p_donor_notes: String(formData.get("donorNotes") ?? "").trim() || null,
    p_item_description: itemDescription,
    p_item_size: String(formData.get("itemSize") ?? "").trim() || null,
    p_item_type: itemType,
    p_item_gender: String(formData.get("itemGender") ?? "") || null,
    p_item_condition: condition,
    p_item_face_value: faceValue,
    p_item_notes: String(formData.get("itemNotes") ?? "").trim() || null,
  });

  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory");
  return { success: true };
}
