"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import { parseMountainInput } from "@/lib/rider-profile";

export type RiderMountainsResult =
  { error: string } | { success: true; mountains: string[] };

const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to change the mountain list.",
};

/**
 * Replaces this organization's preferred-mountain list (#1408), which the
 * post-registration rider step and the door-side rider dialog offer.
 *
 * Gated on rider_profiles:manage, which carries the rider_profile module, and
 * written through set_rider_profile_mountains() -- which checks the same
 * permission and the same rules again, since app_settings' own write policy
 * is system_settings:manage and this list lives with the feature.
 */
export async function updateRiderMountainsAction(
  text: string,
): Promise<RiderMountainsResult> {
  const parsed = parseMountainInput(text);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change the mountain list.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "rider_profiles",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_rider_profile_mountains", {
    p_mountains: parsed.mountains,
  });
  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not save the mountain list. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  // The public step reads the list per request; nothing public is cached on it.
  return { success: true, mountains: parsed.mountains };
}
