"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { PRONOUNS_MAX_LENGTH, PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";

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
