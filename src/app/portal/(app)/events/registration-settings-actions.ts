"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";

export type RegistrationSettingsResult = { error: string } | { success: true };

/**
 * Turns this organization's under-18 registration questions on or off
 * (#1416).
 *
 * Gated on events:manage and written through
 * set_registration_asks_about_minors(), which checks the same permission
 * again -- app_settings' own write policy is system_settings:manage, and this
 * setting lives with the feature it shapes.
 */
export async function updateAsksAboutMinorsAction(
  enabled: boolean,
): Promise<RegistrationSettingsResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change registration settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_registration_asks_about_minors", {
    p_enabled: enabled,
  });
  if (error) {
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to change registration settings."
          : "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  // The public form reads the setting per request; nothing public is cached on it.
  return { success: true };
}
