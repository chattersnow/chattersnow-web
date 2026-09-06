"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { PRONOUNS_MAX_LENGTH, PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import { isNotificationKind } from "@/lib/notifications/kinds";

export async function updateMyPreferredNameAction(
  preferredName: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  // No permission check by design: every signed-in portal user may set their
  // own preferred name. The RPC is security definer because people.update RLS
  // requires people:manage, which board and volunteer accounts don't hold.
  const { error } = await supabase.rpc("set_my_preferred_name", {
    p_preferred_name: preferredName,
  });
  if (error) {
    return { error: "Could not save your preferred name. Please try again." };
  }

  revalidatePath("/portal/account");
  // The sidebar header greeting is rendered by the portal layout.
  revalidatePath("/portal", "layout");
  return { success: true };
}

export async function updateMyPronounsAction(
  pronouns: string,
): Promise<{ error: string } | { success: true }> {
  if (pronouns.trim().length > PRONOUNS_MAX_LENGTH) {
    return { error: PRONOUNS_TOO_LONG_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  // No permission check, and a security-definer RPC, for the same reasons
  // set_my_preferred_name has both: this only ever writes the caller's own
  // record, and people.update RLS requires people:manage, which board and
  // volunteer accounts don't hold.
  const { error } = await supabase.rpc("set_my_pronouns", {
    p_pronouns: pronouns,
  });
  if (error) {
    return { error: "Could not save your pronouns. Please try again." };
  }

  revalidatePath("/portal/account");
  return { success: true };
}

/**
 * Turns one kind of email on or off for the signed-in person (#488).
 *
 * No permission check, like its neighbours: this only ever writes the caller's
 * own row. Unlike them it needs no security definer RPC either --
 * person_notification_preferences is a new table, so its policies are
 * self-scoped from the start (`person_id = my_person_id()`), where `people`
 * update RLS demands people:manage and forced set_my_preferred_name into an
 * RPC.
 *
 * `ensureCurrentPerson` rather than `resolveCurrentPersonId`: a portal account
 * with no people row has nothing to hang a preference on, and every owner
 * column in the portal references people anyway, so creating it here is the
 * same thing the account page already does on load.
 *
 * tenant_id is left to its column default, which resolves to the caller's
 * current tenant -- the same shape as updateAppSettingAction's upsert.
 */
export async function updateMyNotificationPreferenceAction(
  kind: string,
  enabled: boolean,
): Promise<{ error: string } | { success: true }> {
  if (!isNotificationKind(kind)) {
    return { error: "That is not something the portal sends." };
  }

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  const person = await ensureCurrentPerson(supabase);
  if (!person) {
    return { error: "Could not find your record. Please try again." };
  }

  const { error } = await supabase
    .from("person_notification_preferences")
    .upsert(
      { person_id: person.person_id, kind, enabled },
      { onConflict: "tenant_id,person_id,kind" },
    );
  if (error) {
    return {
      error: "Could not save your email preferences. Please try again.",
    };
  }

  revalidatePath("/portal/account");
  return { success: true };
}
