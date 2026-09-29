import { accountLabel } from "@/lib/constituent/account-label";

/**
 * The module a tenant opts into to have a constituent area at all (#1161).
 *
 * Lives here rather than beside the guard that enforces it, for the reason
 * `paths.ts` exists: `guard.ts` reaches `next/headers` through the server
 * Supabase client, so anything that imports it for one constant drags that in
 * too -- into the browser bundle from a client component, and into a unit test
 * that only wanted to check an entitlement. `guard.ts` re-exports it, so the
 * name is still available where the enforcement is.
 */
export const CONSTITUENT_MODULE = "constituent_accounts";

/**
 * What the public site's account control renders (#1175).
 *
 * Three states rather than two, because "the tenant does not offer accounts"
 * and "you are not signed in" must not look alike: the first shows nothing at
 * all, since a visitor to an organization that has not bought into constituent
 * accounts should not learn from its website that the feature exists.
 */
export type ConstituentAccountNav =
  | { enabled: false }
  | { enabled: true; signedIn: false }
  | {
      enabled: true;
      signedIn: true;
      label: string | null;
      email: string | null;
    };

/** The state for a tenant without the module -- the default everywhere. */
export const ACCOUNT_NAV_OFF: ConstituentAccountNav = { enabled: false };

/** As much of the signed-in user as the control needs. */
export type AccountClaims = {
  email?: unknown;
  user_metadata?: { full_name?: unknown; name?: unknown } | null;
};

/**
 * The control's state, from whether the tenant offers accounts and who is
 * signed in in this browser.
 *
 * Pure, and in this file rather than in `guard.ts`, because the client
 * component that computes it imports from here (#1467 moved the session read
 * into the browser). A `guard.ts` import would pull `next/headers` into the
 * browser bundle -- which Turbopack refuses outright, and which nothing but
 * running the app would have caught.
 *
 * `claims` of null covers signed out and "no session could be read" alike.
 * They are the same thing to a visitor: there is nothing to act on, and the
 * signed-out control is the honest thing to render.
 */
export function constituentAccountNav(
  enabled: boolean,
  claims: AccountClaims | null,
): ConstituentAccountNav {
  if (!enabled) return ACCOUNT_NAV_OFF;
  if (!claims) return { enabled: true, signedIn: false };

  return {
    enabled: true,
    signedIn: true,
    label: accountLabel(claims),
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
