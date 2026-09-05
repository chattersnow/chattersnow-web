"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";

const PATH = "/portal/administration/data-retention";

/**
 * Runs the purge in dry run. There is deliberately no action here that runs it
 * for real: enforcement is what the nightly job does, and a rule only acts once
 * its policy is set to 'enforce'. A "purge now" button would be a one-click
 * destructive operation over live donor and participant data, with the review
 * step -- reading the counts a dry run produced -- skipped.
 */
export async function runRetentionDryRunAction(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to run a retention preview.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  // The RPC re-checks the same permission rather than trusting this call site,
  // matching merge_people() and set_person_role_tags().
  const { error } = await supabase.rpc("trigger_retention_run", {
    p_dry_run: true,
  });

  if (error) {
    return { error: "Could not run the retention preview. Please try again." };
  }

  revalidatePath(PATH);
  return { success: true };
}

const MODES = ["off", "dry_run", "enforce"] as const;

/**
 * Turns a single rule off, into preview, or into enforcement. This is the
 * control that makes the feature live, and it is deliberately per-policy: the
 * board reviews a few nights of counts for one category and turns that one on,
 * rather than flipping the whole job at once.
 */
export async function setRetentionPolicyModeAction(
  policyKey: string,
  mode: string,
): Promise<{ error: string } | { success: true }> {
  if (!(MODES as readonly string[]).includes(mode)) {
    return { error: "Unknown retention mode." };
  }

  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to change a retention policy.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_retention_policy_mode", {
    p_policy_key: policyKey,
    p_mode: mode,
  });

  if (error) {
    return {
      error: "Could not update this retention policy. Please try again.",
    };
  }

  revalidatePath(PATH);
  return { success: true };
}
