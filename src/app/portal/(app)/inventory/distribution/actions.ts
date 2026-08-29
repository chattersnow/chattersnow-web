"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDistributionEditForm } from "./distribution-edit-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type DistributionMutationResult = { error: string } | { success: true };

function revalidateDistributionPaths(movementId?: string) {
  revalidatePath("/portal/inventory/distribution");
  if (movementId) {
    revalidatePath(`/portal/inventory/distribution/${movementId}`);
  }
  revalidatePath("/portal/home");
  revalidatePath("/portal/events");
}

// Update/delete are gated on inventory:manage (not inventory_intake:manage)
// to match the inventory_movements RLS update/delete policies — recording a
// distribution is intentionally more widely available than rewriting one.
export async function updateDistributionAction(
  movementId: string,
  formData: FormData,
): Promise<DistributionMutationResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a distribution.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseDistributionEditForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("inventory_movements")
    .update(parsed.data)
    .eq("id", movementId)
    .eq("movement_type", "distributed");

  if (error) {
    return { error: "Could not save the distribution. Please try again." };
  }

  revalidateDistributionPaths(movementId);
  return { success: true };
}

export async function deleteDistributionAction(
  movementId: string,
): Promise<DistributionMutationResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete a distribution.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("inventory_movements")
    .delete()
    .eq("id", movementId)
    .eq("movement_type", "distributed");

  if (error) {
    return { error: "Could not delete the distribution. Please try again." };
  }

  revalidateDistributionPaths();
  return { success: true };
}
