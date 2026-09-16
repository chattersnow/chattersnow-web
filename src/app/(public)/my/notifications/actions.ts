"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isNotificationKind } from "@/lib/notifications/kinds";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

const MY_NOTIFICATIONS_PATH = `${MY_PATH_PREFIX}/notifications`;

/**
 * Turns one kind of email on or off for the caller (#1165).
 *
 * The twin of /portal/account's action, and different in exactly one way: it
 * writes through `set_my_notification_preference()` rather than through the
 * table. `person_notification_preferences`' write policies resolve the caller
 * through `current_tenant_id()` and `my_person_id()`, both of which read a
 * tenant membership -- and #1160 decided a constituent would never have one.
 * The RPC resolves the same person from `auth.uid()` and the request host
 * instead, and writes the same row.
 *
 * No permission check here, for the reason no action under `/my` has one:
 * authorization is "this row is yours", and whose row it is comes from the
 * session and the host, never from an argument.
 */
export async function setMyNotificationPreferenceAction(
  kind: string,
  enabled: boolean,
): Promise<{ error: string } | { success: true }> {
  if (!isNotificationKind(kind)) {
    return { error: "That is not something we send." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_notification_preference", {
    p_kind: kind,
    p_enabled: enabled,
  });

  if (error) {
    return { error: "Could not save that. Please try again." };
  }

  revalidatePath(MY_NOTIFICATIONS_PATH);
  return { success: true };
}
