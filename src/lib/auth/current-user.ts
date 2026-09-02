import type { SupabaseClient, User } from "@supabase/supabase-js";

const DEFAULT_SIGNED_OUT_MESSAGE = "You must be signed in.";

/**
 * Server Action variant of an auth guard: returns { error } instead of
 * redirecting, since a Server Action must surface a failure as an inline
 * result the client can show, not a navigation. Returns { user } on success.
 */
export async function checkUser(
  supabase: SupabaseClient,
  message: string = DEFAULT_SIGNED_OUT_MESSAGE,
): Promise<{ user: User } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: message };
  }
  return { user };
}
