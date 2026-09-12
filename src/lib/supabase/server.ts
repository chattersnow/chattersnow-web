import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Header that carries the host the browser asked for through to Postgres.
 *
 * A request with no session -- every public page and every public form --
 * has nothing else that says which tenant it is for. PostgREST exposes the
 * request headers to SQL, and `public_tenant_id()` (multi-tenancy Phase 3,
 * #707) resolves this one against `tenants.custom_domain`, so the public_*
 * views and the anon intake RPCs answer for the site that was actually
 * visited.
 *
 * Signed-in *data* still never comes from it: every policy predicate and
 * `has_permission()` go through `current_tenant_id()`, which is
 * membership-checked. Since #956 the portal shell does read the host's tenant
 * -- to refuse a session on an organization's host that the account is not in,
 * and to scope a multi-tenant account to the organization whose address it
 * typed -- but it can only ever narrow to a tenant the account already holds a
 * live membership in. Nothing here grants access.
 */
export const TENANT_HOST_HEADER = "x-tenant-host";

/**
 * The host to resolve the tenant against, given the request's own Host.
 *
 * `tenants.custom_domain` is a single unique column, so a tenant can list one
 * host and no more -- and `vercel.json` deploys both `development` and `main`
 * against the same Supabase project, so a request to
 * `chattersnow-web-git-development-*.vercel.app` matches nothing and the whole
 * public site comes back empty. `TENANT_HOST_OVERRIDE` is set on the Vercel
 * Preview and Development environments to name the tenant those deployments
 * are for; production leaves it unset and uses the real Host.
 *
 * Server-only (no `NEXT_PUBLIC_`) and only ever compared against
 * `custom_domain`, so the worst a wrong value can do is serve the wrong
 * tenant's *public* pages -- exactly what visiting that tenant's site does --
 * and, since #956, send a portal session to the "wrong organization" screen.
 * It cannot widen anyone's access, only narrow it.
 */
export function tenantHost(requestHost: string | null): string | null {
  const override = process.env.TENANT_HOST_OVERRIDE?.trim();
  return override || requestHost || null;
}

/**
 * One client per request, not per call site.
 *
 * A single portal page calls this from the root layout, each nested section
 * layout, the page itself, and every Server Action it fires -- and each new
 * client meant every one of those re-resolved permissions from scratch.
 * React's `cache` is request-scoped, so callers within a request share an
 * instance and anything memoized against it (see getCurrentUserPermissions)
 * actually hits.
 */
export const createSupabaseServerClient = cache(
  async function createSupabaseServerClient() {
    const [cookieStore, headerStore] = await Promise.all([
      cookies(),
      headers(),
    ]);
    // Same source the proxy routes on (src/proxy.ts); Vercel presents the
    // custom domain here, not the deployment host -- except on a preview
    // deployment, which is what TENANT_HOST_OVERRIDE is for.
    const host = tenantHost(headerStore.get("host"));

    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: host ? { headers: { [TENANT_HOST_HEADER]: host } } : undefined,
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              // Cookie writes can fail in a Server Component; the proxy refreshes sessions.
            }
          },
        },
      },
    );
  },
);
