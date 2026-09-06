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
 * visited. Signed-in reads never consult it: they go through
 * `current_tenant_id()`, which is membership-checked.
 */
export const TENANT_HOST_HEADER = "x-tenant-host";

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
    // custom domain here, not the deployment host.
    const host = headerStore.get("host");

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
