"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";

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
