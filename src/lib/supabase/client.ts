import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "@/lib/auth/session-cookie";
import type { Db } from "@/lib/supabase/types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Db>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // The same scope the server client uses (#1161). This client writes the
      // session cookie itself -- `signInWithPassword` on the login form is
      // where most sessions in this app begin -- so if the two disagreed the
      // browser would hold a host-only cookie and a domain-scoped one under
      // one name and send both. `sessionCookieDomain` reads a NEXT_PUBLIC_
      // variable precisely so that both sides can compute the same answer.
      //
      // `window` is always present here: this module is only imported from
      // client components. Guarded anyway because `createBrowserClient`
      // memoizes per call site, and a prerender that reached it would bake a
      // scope in for every later caller.
      cookieOptions:
        typeof window === "undefined"
          ? undefined
          : sessionCookieOptions(window.location.hostname),
    },
  );
}
