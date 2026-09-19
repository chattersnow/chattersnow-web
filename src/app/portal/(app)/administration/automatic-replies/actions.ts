"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import {
  autoReplyDefinition,
  validateAutoReplySlots,
} from "@/lib/notifications/auto-replies";

export type AutoReplyActionResult = { error: string } | { success: true };

/** This page's route, revalidated by both actions below. */
const AUTOMATIC_REPLIES_PATH = "/portal/administration/automatic-replies";

/**
 * Not `writeAppSetting`: these rows are not `app_settings`. They live in
 * `auto_reply_templates` so each reply carries its own `enabled` column and
 * its own audit row (#1233). The permission is the same one, and it is
 * re-checked here rather than trusted from the nav -- `visibleNavItems()`
 * decides what a sidebar draws and nothing more.
 */
async function authorized() {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "system_settings", "manage");
  return { supabase, denied };
}

/**
 * One reply's copy, as the sparse override object the resolver expects.
 *
 * `slots` holds only the slots this tenant has rewritten. A slot reset to the
 * platform's wording arrives as an absent key rather than as the default
 * string, which is the whole point of the sparseness: a tenant who resets goes
 * back to tracking the defaults as they improve, instead of freezing today's
 * copy under their own name.
 */
export async function saveAutoReplyCopyAction(
  kind: string,
  slots: Record<string, string>,
): Promise<AutoReplyActionResult> {
  const { supabase, denied } = await authorized();
  if (denied) return denied;

  const definition = autoReplyDefinition(kind);
  if (!definition) return { error: "That automatic reply does not exist." };

  // Validated before the write, not after: the database's checks on `slots`
  // are a backstop against the service-role path and say nothing an
  // administrator could act on. These name the field.
  const problems = validateAutoReplySlots(definition, slots);
  if (problems.length > 0) {
    return { error: problems.map((problem) => problem.message).join(" ") };
  }

  const { error } = await supabase
    .from("auto_reply_templates")
    .upsert({ kind, slots }, { onConflict: "tenant_id,kind" });
  if (error) {
    return { error: "Could not save this reply. Please try again." };
  }

  revalidatePath(AUTOMATIC_REPLIES_PATH);
  return { success: true };
}

/**
 * Whether this one receipt goes out at all.
 *
 * Its own action, and applied on the switch rather than on Save, for the same
 * reason the org-wide kill switch in Organization Settings -> Notifications
 * is: turning a receipt off is an operational decision, not a draft, and
 * burying it in a copy save would leave "3 changes" meaning one reworded
 * sentence and one silenced confirmation.
 *
 * The upsert names only `enabled`, so a tenant who has rewritten slots keeps
 * them when the reply is switched off and back on.
 */
export async function setAutoReplyEnabledAction(
  kind: string,
  enabled: boolean,
): Promise<AutoReplyActionResult> {
  const { supabase, denied } = await authorized();
  if (denied) return denied;

  if (!autoReplyDefinition(kind)) {
    return { error: "That automatic reply does not exist." };
  }

  const { error } = await supabase
    .from("auto_reply_templates")
    .upsert({ kind, enabled }, { onConflict: "tenant_id,kind" });
  if (error) {
    return { error: "Could not change this reply. Please try again." };
  }

  revalidatePath(AUTOMATIC_REPLIES_PATH);
  return { success: true };
}
