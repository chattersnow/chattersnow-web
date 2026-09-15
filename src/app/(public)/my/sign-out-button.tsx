"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MY_SIGN_IN_PATH } from "@/lib/constituent/paths";

/**
 * Sign out of the constituent area.
 *
 * Deliberately not `signOutAndRedirect`: that one belongs to the portal, drops
 * the portal's service-worker caches and lands on `/portal/login`, none of
 * which is right here. What it shares is the part that matters --
 * `scope: "local"`, so signing out on the public site ends this browser's
 * session and not the same person's session on their phone. Because one
 * account serves both surfaces (#1160), a global sign-out here would also
 * throw an administrator out of the portal they had open in the next tab.
 *
 * `router.refresh()` for the usual App Router reason: without it the cached
 * RSC payload keeps rendering the signed-in page on a back navigation, which
 * reads as the sign-out having failed.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      // Even a failed sign-out leaves the area, for the same reason the
      // portal's does: stranding someone on a signed-in-looking page with no
      // error is worse than sending them to a sign-in they may still hold a
      // session for.
      router.replace(MY_SIGN_IN_PATH);
      router.refresh();
    }
  }

  return (
    <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? <Spinner /> : null}
      {isSigningOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}
