"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { CURRENT_RELEASE } from "./releases";

export type WelcomeActionResult = { error: string } | { success: true };

// No permission check in this file by design, same as account/actions.ts:
// both only ever touch the signed-in user's own row, and user_onboarding's
// RLS is self-scoped, so there's nothing a permission level would add.

/**
 * Finishing, skipping, or closing the tour all land here. It also marks the
 * current release seen: someone who just took the introduction has no use for
 * a changelog behind it.
 */
export async function completeWelcomeAction(): Promise<WelcomeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  const { error } = await supabase.rpc("complete_my_welcome", {
    p_current_release: CURRENT_RELEASE,
  });
  if (error) {
    return { error: "Could not save your progress. Please try again." };
  }

  // The dialog is rendered by the portal layout, so that's what has to be
  // revalidated for the tour to stay closed on the next full page load.
  revalidatePath("/portal", "layout");
  return { success: true };
}

/**
 * Dismissing the release notes. The release key comes from the client so it's
 * the one the user was actually shown -- a tab left open across a deploy can't
 * mark a newer release seen than the notes it rendered.
 */
export async function markReleaseSeenAction(
  release: string,
): Promise<WelcomeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  const { error } = await supabase.rpc("mark_release_seen", {
    p_release: release,
  });
  if (error) {
    return { error: "Could not save your progress. Please try again." };
  }

  revalidatePath("/portal", "layout");
  return { success: true };
}

/** Replay, from /portal/account. */
export async function resetWelcomeAction(): Promise<WelcomeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;

  const { error } = await supabase.rpc("reset_my_welcome");
  if (error) {
    return { error: "Could not restart the tour. Please try again." };
  }

  revalidatePath("/portal", "layout");
  return { success: true };
}
