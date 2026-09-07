import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_RELEASE } from "@/app/portal/(app)/welcome/releases";

export type OnboardingState = {
  /** When this account first reached the portal. */
  firstSeenAt: string;
  /** Null while the welcome tour is still owed. */
  welcomeCompletedAt: string | null;
  /**
   * The most recent release whose notes this account has been shown. Null for
   * accounts that predate release notes; stamped at CURRENT_RELEASE for
   * accounts created since, so a brand-new user gets the tour and not a
   * changelog for a portal they've never seen.
   */
  lastReleaseSeen: string | null;
};

type OnboardingRow = {
  first_seen_at: string;
  welcome_completed_at: string | null;
  last_release_seen: string | null;
};

/**
 * Records this account's first arrival in the portal and reports what it has
 * already been shown -- the welcome tour and the latest release notes
 * (ensure_my_onboarding RPC). The insert behind it is a no-op after the first
 * call, so this is safe on every layout render.
 *
 * Returns null when signed out or on error -- the portal shell must render
 * either way, and the only cost of a null here is a tour that isn't offered
 * on this request.
 */
export async function ensureMyOnboarding(
  supabase: SupabaseClient,
): Promise<OnboardingState | null> {
  const { data, error } = await supabase.rpc("ensure_my_onboarding", {
    p_current_release: CURRENT_RELEASE,
  });
  if (error) return null;
  const row = ((data ?? []) as OnboardingRow[])[0];
  if (!row) return null;
  return {
    firstSeenAt: row.first_seen_at,
    welcomeCompletedAt: row.welcome_completed_at,
    lastReleaseSeen: row.last_release_seen,
  };
}
