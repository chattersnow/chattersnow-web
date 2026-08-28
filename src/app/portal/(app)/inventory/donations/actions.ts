"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDonationEditForm } from "./donation-edit-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type UpdateDonationResult = { error: string } | { success: true };

export async function updateDonationAction(
  donationId: string,
  formData: FormData,
): Promise<UpdateDonationResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a donation.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "finance", level: "manage" },
    { resource: "inventory", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseDonationEditForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("donations")
    .update(parsed.data)
    .eq("id", donationId);

  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidatePath("/portal/inventory/donations");
  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
  return { success: true };
}
