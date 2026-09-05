import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { broadcastSignOut } from "@/lib/auth/idle-timeout";
import { safePortalDestination } from "@/lib/auth/next-destination";

/**
 * The one browser sign-out path: end the session, leave the shell, and drop
 * the cached RSC payload behind it.
 *
 * `router.refresh()` is not optional -- without it the App Router serves the
 * signed-in layout from cache if the user navigates back, which looks like the
 * sign-out silently failed.
 *
 * Takes the router rather than calling `useRouter` itself so it can be invoked
 * from a timer callback, not just from a render.
 */
export async function signOutAndRedirect(
  router: AppRouterInstance,
  options: { reason?: string; next?: string | null } = {},
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  try {
    // Local scope, not Supabase's default of "global": this ends the session
    // in this browser only. A global sign-out revokes every refresh token the
    // account holds, so logging out on a laptop would silently sign the same
    // person out on their phone -- and, in the e2e suite, sign every other
    // worker signed in as the shared seeded admin out mid-test (#474).
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Swallowed deliberately -- see the redirect below.
  } finally {
    // Even a failed sign-out has to leave the portal. Letting a network blip
    // strand someone on an authenticated-looking shell with no error is worse
    // than redirecting to a login page they may still hold a session for.
    // Callers rely on this settling rather than rejecting: LogoutButton would
    // otherwise be stuck on "Signing out...", and IdleTimeout calls it with
    // `void`, so a rejection there is unhandled.
    broadcastSignOut();
    router.replace(buildLoginUrl(options));
    router.refresh();
  }
}

export function buildLoginUrl({
  reason,
  next,
}: { reason?: string; next?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  // Sanitized here as well as on the login page: this decides a redirect
  // target, and `safePortalDestination` answers with the dashboard for
  // anything off-portal, which is exactly the value worth omitting.
  const destination = next ? safePortalDestination(next) : null;
  if (destination && destination !== "/portal/home") {
    params.set("next", destination);
  }
  const query = params.toString();
  return query ? `/portal/login?${query}` : "/portal/login";
}

/**
 * Turns the browser's current location into a `next` the login page will
 * accept.
 *
 * On portal.chattersnow.org the proxy rewrites unprefixed paths into /portal/*
 * internally, so a visitor who typed the bare URL sees "/people" in the
 * address bar while the route is "/portal/people". `safePortalDestination`
 * rejects anything outside /portal, so without this the return path would
 * silently collapse to the dashboard on that host.
 */
export function portalDestinationFrom(
  pathname: string,
  search: string = "",
): string {
  const path =
    pathname === "/portal" || pathname.startsWith("/portal/")
      ? pathname
      : `/portal${pathname}`;
  return `${path}${search}`;
}
