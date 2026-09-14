import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Db, SupabaseClient } from "@/lib/supabase/types";

/**
 * The header a request names its tenant with (#813 Phase 2).
 *
 * `createSupabaseServerClient` stamps `x-tenant-host` from the request's own
 * Host, which is how the site running on a tenant's domain resolves. A request
 * to `/api/v1/t/{slug}/...` arrives from somewhere else entirely -- its Host
 * names that somewhere -- so the slug in the path becomes this header and
 * `public_tenant_id()` resolves from it instead.
 */
export const TENANT_SLUG_HEADER = "x-tenant-slug";

/**
 * The anon client the public API reads and writes through.
 *
 * Deliberately not `createSupabaseServerClient()`: that one binds to Next's
 * cookies to carry a session, and a session is exactly what must not decide
 * anything here. An API caller is `anon` and nothing else, so it sees the
 * `public_*` views and the intake RPCs and no more -- the same surface a
 * visitor to the tenant's own site has. No service-role key is involved at any
 * point in this layer.
 *
 * Not request-memoized either, unlike the server client: a route handler makes
 * its reads once and returns.
 */
export function createSupabaseApiClient(slug: string): SupabaseClient {
  return createClient<Db>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { [TENANT_SLUG_HEADER]: slug } },
    },
  );
}
