import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";

export type SettingActionResult = { error: string } | { success: true };

/**
 * The one write behind every `app_settings` setting action, extracted when
 * #990 split those actions across two sections.
 *
 * Three of the settings panels moved from Administration to Website, and their
 * actions moved with them -- but the permission check and the upsert are the
 * same in both places, and `system_settings:manage` is the resource whichever
 * section the panel is rendered in. Duplicating that check into a second
 * actions file would have been two places for one rule to drift.
 *
 * `revalidate` is what actually differs: an action has to invalidate the page
 * it was called from, and before the split that was always the settings page.
 * Callers pass their own route. It is never a client-supplied value -- each
 * action names its own path as a literal -- which is why a path parameter here
 * is not the hole it would be on an exported server action.
 *
 * Not a server action itself: this module carries no "use server", so it can
 * export a type alongside the function and be imported by both actions files.
 */
export async function writeAppSetting(
  key: string,
  value: unknown,
  revalidate: readonly string[],
): Promise<SettingActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "tenant_id,key" });
  if (error) {
    return { error: "Could not save this setting. Please try again." };
  }

  for (const path of revalidate) revalidatePath(path);
  return { success: true };
}
