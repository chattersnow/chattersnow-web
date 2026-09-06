import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Mint a sign-in link for an email address, as the service role.
 *
 * Lifted out of `administration/users/actions.ts` when the platform page
 * (#707 Phase 5c) needed the same thing after provisioning a tenant, and
 * `scripts/tenant-cli.ts` already had a third copy. Three copies of a
 * service-role auth call is two too many for something that hands out a
 * session.
 *
 * The magic-link fallback is what makes re-inviting somebody who already has
 * an account work rather than dead-end on `email_exists`. It is also why #759
 * exists: nothing here checks that the address is the caller's tenant's to
 * invite, so the fallback can mint a session for an account belonging to
 * somebody else. Fixing that is #759's job -- this helper deliberately does
 * not grow a policy of its own, because a check that lives in one of three
 * copies is the situation we just removed. Callers gate; this mints.
 */
export type InviteLink = { link: string } | { error: string };

export async function mintInviteLink(
  email: string,
  origin: string,
): Promise<InviteLink> {
  const admin = createSupabaseAdminClient();
  const redirectTo = `${origin}/auth/confirm`;

  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  let linkType: "invite" | "magiclink" = "invite";

  if (result.error?.code === "email_exists") {
    result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    linkType = "magiclink";
  }

  if (result.error || !result.data) {
    return {
      error: "Could not generate a link for this email. Please try again.",
    };
  }

  return {
    link:
      `${origin}/auth/confirm?token_hash=${result.data.properties.hashed_token}` +
      `&type=${linkType}&next=/portal/set-password`,
  };
}
