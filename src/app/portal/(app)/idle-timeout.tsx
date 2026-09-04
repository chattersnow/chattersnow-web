"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  IDLE_SIGNOUT_REASON,
  SIGNED_OUT_KEY,
  formatCountdown,
} from "@/lib/auth/idle-timeout";
import { portalDestinationFrom, signOutAndRedirect } from "@/lib/auth/sign-out";

/**
 * Ends an unattended portal session (#617).
 *
 * Mounted once in the portal shell, which is the only layout that survives
 * navigation -- and, being inside `(app)`, the only place that is already
 * behind the signed-in guard. That's what keeps this off the login page and
 * off every public route without needing a route check of its own.
 */
export function IdleTimeout() {
  const router = useRouter();
  // One-shot guard. The scheduler, a SIGNED_OUT broadcast from another tab and
  // a click on "Log out now" can arrive in the same tick; only the first gets
  // to sign out, and only it knows to say why.
  const signingOutRef = useRef(false);

  const leave = useCallback(
    (options: { reason?: string; next?: string | null } = {}) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      void signOutAndRedirect(router, options);
    },
    [router],
  );

  const handleExpire = useCallback(() => {
    leave({
      reason: IDLE_SIGNOUT_REASON,
      // Read from the browser rather than useSearchParams: this runs from a
      // timer callback, and the location is what the user would come back to.
      next: portalDestinationFrom(
        window.location.pathname,
        window.location.search,
      ),
    });
  }, [leave]);

  const { warning, msRemaining, extend } = useIdleTimeout({
    onExpire: handleExpire,
  });

  // Following another tab out. Supabase broadcasts SIGNED_OUT over a
  // BroadcastChannel, and the explicit storage key covers the contexts where
  // that channel isn't available -- the session itself lives in cookies, which
  // never raise storage events. Either way this tab only redirects; the tab
  // that started it owns the actual sign-out.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      router.replace("/portal/login");
      router.refresh();
    });

    function handleStorage(storageEvent: StorageEvent) {
      if (storageEvent.key !== SIGNED_OUT_KEY || !storageEvent.newValue) return;
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      router.replace("/portal/login");
      router.refresh();
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [router]);

  return (
    <AlertDialog
      open={warning}
      onOpenChange={(next) => {
        // Escape and every other dismissal mean "I'm here" -- never a silent
        // close that leaves someone unwarned with a minute to go.
        if (!next && !signingOutRef.current) extend();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ve been inactive for a while, so we&apos;re about to sign
            you out to keep the portal&apos;s records private on this device.
            Any unsaved work will be lost.{" "}
            {/* Hidden from screen readers on purpose: a live per-second
                countdown would queue an announcement every second for two
                minutes and make the dialog unusable. The alertdialog role
                already announces the warning when it opens. */}
            <span aria-hidden="true">
              Signing out in {formatCountdown(msRemaining)}.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* One action, deliberately. Any pointer or key event anywhere --
              including reaching for this button -- already counts as activity
              and dismisses the dialog, so a second "log out now" button could
              never actually be clicked: the press that reached it would have
              cancelled the warning first. The button is the explicit,
              keyboard-reachable way to say "I'm here"; the activity listener
              is what usually gets there first. */}
          <AlertDialogAction onClick={extend}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
