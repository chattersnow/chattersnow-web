import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
    const cookieStore = await cookies();

    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
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
