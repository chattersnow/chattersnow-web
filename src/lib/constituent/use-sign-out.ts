"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MY_SIGN_IN_PATH } from "@/lib/constituent/paths";
import { navigateAfterSessionChange } from "@/lib/constituent/session-navigation";
import { clearAppCaches } from "@/lib/pwa/service-worker";

/**
 * Sign out of the constituent area, from anywhere on the public site.
 *
 * Extracted from `/my`'s own button when the header gained the same action
 * (#1175): two copies of a sign-out is two chances to get the scope wrong, and
 * the scope is the whole point.
 *
 * Deliberately not `signOutAndRedirect`: that one belongs to the portal and
 * lands on `/portal/login`, which is not right here. What it shares is the
 * part that matters --
 * `scope: "local"`, so signing out on the public site ends this browser's
 * session and not the same person's session on their phone. Because one
 * account serves both surfaces (#1160), a global sign-out here would also
 * throw an administrator out of the portal they had open in the next tab.
 *
 * `navigateAfterSessionChange` for the usual App Router reason: without the
 * refresh it carries, the cached RSC payload keeps rendering the signed-in
 * page -- and, since #1175, the signed-in header on every other public page --
 * which reads as the sign-out having failed. Sign-in needs the same thing
 * (#1304), which is why the pair is one function.
 */
export function useConstituentSignOut(): {
  signOut: () => Promise<void>;
  isSigningOut: boolean;
} {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      // The public site is an installable app of its own since #1171, so it
      // drops its caches on the way out exactly as the portal does. Nothing
      // authenticated is ever cached (see public/sw.js), so this clears
      // immutable chunks and the offline page -- but "everything this session
      // cached is gone" is worth being able to say plainly on a shared phone.
      // CacheStorage is per origin, so on a host that serves both surfaces
      // this clears the portal's too; harmless, for the same reason. Awaited
      // before the navigation so the clear is not racing it, and it never
      // rejects.
      await clearAppCaches();
      // Even a failed sign-out leaves the area, for the same reason the
      // portal's does: stranding someone on a signed-in-looking page with no
      // error is worse than sending them to a sign-in they may still hold a
      // session for.
      navigateAfterSessionChange(router, MY_SIGN_IN_PATH);
    }
  }

  return { signOut, isSigningOut };
}
