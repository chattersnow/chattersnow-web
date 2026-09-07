import type { createAdminClient } from "./admin-client";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Marks a throwaway account as already onboarded.
 *
 * Every portal page offers a brand-new account the welcome tour as a modal
 * dialog, which hides the page behind it from role-based locators. The
 * accounts in supabase/seed.sql are marked onboarded there; accounts a spec
 * creates through auth.admin.createUser() need the same treatment, or the
 * first page they open is the tour. Uses seed.sql's far-future release
 * sentinel so the "what's new" dialog stays out of the way too.
 */
export async function markOnboarded(admin: AdminClient, userId: string) {
  const { error } = await admin.from("user_onboarding").upsert(
    {
      user_id: userId,
      welcome_completed_at: new Date().toISOString(),
      last_release_seen: "9999-12-31",
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}
