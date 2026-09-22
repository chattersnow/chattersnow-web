"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { parseScreeningTierForm } from "./screening-tier-form";

/**
 * `field` rides along from the form parser, which names the input its
 * message belongs to (`ParseResult`, #1082 Phase 2). Declared here rather
 * than dropped, so a test can assert the whole answer an action gives.
 */
export type ScreeningTierActionResult =
  { error: string; field?: string } | { success: true };

const SCREENING_PATH = "/portal/volunteers/screening";

export async function createScreeningTierAction(
  formData: FormData,
): Promise<ScreeningTierActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a screening level.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteer_screening",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseScreeningTierForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("volunteer_screening_tiers")
    .insert(parsed.data);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A screening level with this name already exists.",
        "Could not add the screening level. Please try again.",
      ),
    };
  }

  revalidatePath(SCREENING_PATH);
  return { success: true };
}

export async function updateScreeningTierAction(
  id: string,
  formData: FormData,
): Promise<ScreeningTierActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a screening level.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteer_screening",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseScreeningTierForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("volunteer_screening_tiers")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A screening level with this name already exists.",
        "Could not update the screening level. Please try again.",
      ),
    };
  }

  // A level's name is printed beside every outcome that cites it, so renaming
  // one changes the person profile and the application sheet too.
  revalidatePath(SCREENING_PATH);
  revalidatePath("/portal/people", "layout");
  revalidatePath("/portal/volunteers/applications");
  return { success: true };
}
