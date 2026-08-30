"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDonationForm } from "./donation-form";
import { checkPermission } from "@/lib/auth/permissions";

export type DonationActionResult = { error: string } | { success: true };

function revalidateDonationPaths() {
  revalidatePath("/portal/finance/donations");
  revalidatePath("/portal/finance/reports");
}

export async function createDonationAction(
  formData: FormData,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const parsed = parseDonationForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("monetary_donations")
    .insert(parsed.data);
  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}

export async function updateDonationAction(
  id: string,
  formData: FormData,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const parsed = parseDonationForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("monetary_donations")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return { error: "Could not update the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}

export async function deleteDonationAction(
  id: string,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("monetary_donations")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: "Could not delete the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}
