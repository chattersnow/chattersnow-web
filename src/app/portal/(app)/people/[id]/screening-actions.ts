"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import { parsePersonScreeningForm } from "./screening-form";

/**
 * `field` rides along from the form parser, which names the input its
 * message belongs to (`ParseResult`, #1082 Phase 2). Declared here rather
 * than dropped, so a test can assert the whole answer an action gives.
 */
export type PersonScreeningActionResult =
  { error: string; field?: string } | { success: true };

/**
 * Both surfaces that show an outcome, revalidated together: the person's own
 * profile, where it is recorded, and the volunteer application queue, whose
 * sheet reads the same rows.
 */
function revalidateScreeningSurfaces(personId: string) {
  revalidatePath(`/portal/people/${personId}`);
  revalidatePath("/portal/volunteers/applications");
  revalidatePath("/portal/volunteers/screening");
}

export async function recordPersonScreeningAction(
  personId: string,
  formData: FormData,
): Promise<PersonScreeningActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a screening outcome.",
  );
  if ("error" in userResult) return userResult;
  // The narrow gate, never `volunteers` and never OR'd with it (#1360).
  const permissionError = await checkPermission(
    supabase,
    "volunteer_screening",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!personId) return { error: "No person to record this against." };

  const today = todayInZone(await getOrgTimeZone(supabase));
  const parsed = parsePersonScreeningForm(formData, today);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("person_screenings")
    .insert({ person_id: personId, ...parsed.data });

  if (error) {
    return {
      error: friendlyError(
        error,
        "That outcome is already recorded for this person on that date.",
        "Could not record the screening outcome. Please try again.",
      ),
    };
  }

  revalidateScreeningSurfaces(personId);
  return { success: true };
}

/**
 * Removing an outcome, which is the correction path: there is no edit action,
 * because an outcome is three fields and re-recording it is as cheap as
 * amending it. The audit trigger keeps the removal, so "this clearance
 * existed and X deleted it" stays answerable.
 */
export async function removePersonScreeningAction(
  id: string,
  personId: string,
): Promise<PersonScreeningActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a screening outcome.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteer_screening",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("person_screenings")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not remove that outcome. Please try again." };
  }

  revalidateScreeningSurfaces(personId);
  return { success: true };
}
