import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moduleEnabled } from "@/lib/portal/modules";
import { getPublicTenantModules } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MY_PATH_PREFIX,
  MY_SIGN_IN_PATH,
  safeMyDestination,
} from "@/lib/constituent/paths";
import {
  ACCOUNT_NAV_OFF,
  CONSTITUENT_MODULE,
  type ConstituentAccountNav,
  constituentAccountNav,
} from "@/lib/constituent/account-nav";

/**
 * The module a tenant opts into to have a constituent area at all (#1161).
 *
 * Defined in `account-nav.ts` and re-exported here: this module reaches
 * `next/headers` through the server Supabase client, so anything importing it
 * for one constant drags that in too. The enforcement is still here.
 */
export { CONSTITUENT_MODULE };

/**
 * The account control's state for this request's tenant and session (#1175).
 *
 * ## The module check is free
 *
 * `getPublicTenantModules` is `cache()`d and `getPageVisibility()` already
 * calls it, and the public layout already awaits that -- so the entitlement
 * costs no query here however early or late it is read.
 *
 * ## The session check is not, so it is the cheap one, and it is skipped
 *
 * `getClaims()` rather than `getUser()`. `getUser()` is a network round trip to
 * the Auth server, and this runs on every public page view including the
 * anonymous majority; `getClaims()` verifies the JWT locally through the Web
 * Crypto API against a cached JWKS, which is Supabase's own recommendation for
 * "protect a page and identify the caller" as against "fetch the canonical,
 * server-fresh user record". A header greeting is the former.
 *
 * The one caveat worth knowing: under *symmetric* signing keys `getClaims()`
 * falls back to calling the Auth server, and the saving disappears. It is still
 * the correct call -- it just stops being the cheap one until the project
 * migrates to asymmetric keys. The local stack is symmetric, so this path is
 * exercised in development as the slow variant.
 *
 * The entitlement is therefore re-checked here rather than left to
 * `constituentAccountNav`, so that a tenant without the module makes no auth
 * call at all: the check it duplicates is a map lookup, and the call it avoids
 * may be a round trip.
 */
export async function getConstituentAccountNav(
  supabase: SupabaseClient,
): Promise<ConstituentAccountNav> {
  const modules = await getPublicTenantModules(supabase);
  if (!moduleEnabled(modules, CONSTITUENT_MODULE)) return ACCOUNT_NAV_OFF;

  const { data, error } = await supabase.auth.getClaims();
  return constituentAccountNav(modules, error ? null : (data?.claims ?? null));
}

/**
 * Whether this request's tenant has the constituent area turned on.
 *
 * Read through `public_tenant_modules`, which resolves the tenant from the
 * request host, because that is what `/my` is: a public-host route whose
 * visitor may have no session at all yet. `moduleEnabled` treats an unknown
 * key as on, which is the platform-wide fail-open stance -- it cannot apply
 * here, since `constituent_accounts` is in the catalog with
 * `default_enabled = false`, so a tenant that has said nothing reads an
 * explicit `false`.
 */
export async function constituentAreaEnabled(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const modules = await getPublicTenantModules(supabase);
  return moduleEnabled(modules, CONSTITUENT_MODULE);
}

/**
 * 404s the request unless the tenant has the constituent area.
 *
 * `notFound()` rather than a redirect or an explanation: on a tenant that has
 * not enabled this, `/my` is not a page that exists, and saying "this
 * organization does not offer accounts" would be telling a stranger about a
 * product decision they have no stake in.
 */
export async function requireConstituentArea(): Promise<void> {
  if (!(await constituentAreaEnabled())) notFound();
}

/**
 * The signed-in person's `people.id` on this host, or null.
 *
 * Null covers two different situations that the pages above deliberately treat
 * differently: signed out, and signed in but not yet linked to a directory
 * record. Callers that need to tell them apart ask for the user as well.
 */
export async function currentConstituentPersonId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_public_person_id");
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * The guard every page under `/my` that shows personal data must call.
 *
 * Checks the module, then a session, and returns the caller's person id -- or
 * sends them to sign in, carrying where they were going so a shared link
 * survives the round trip.
 *
 * It deliberately does **not** call `has_permission()`. A constituent holds no
 * permissions at all, and most hold no role: authorization here is "this row
 * is yours", which is what the person id is for. The portal keeps its own
 * guard, and keeps refusing these accounts (`/portal` still answers a
 * role-less session with its no-access state).
 *
 * Returns null for the person id when the account is signed in but unlinked,
 * so a page can render the claim path (#1162) rather than bouncing someone who
 * has legitimately just signed up.
 */
export async function requireConstituentSession(
  returnTo?: string,
): Promise<{ userId: string; personId: string | null }> {
  await requireConstituentArea();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = safeMyDestination(returnTo);
    redirect(
      next === MY_PATH_PREFIX
        ? MY_SIGN_IN_PATH
        : `${MY_SIGN_IN_PATH}?next=${encodeURIComponent(next)}`,
    );
  }

  return { userId: user.id, personId: await currentConstituentPersonId() };
}
