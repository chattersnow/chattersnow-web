/**
 * Sanitizes a `next` destination before it's used as a redirect target.
 *
 * Only same-site portal paths are honoured: anything absolute, protocol
 * relative, or outside /portal falls back to the dashboard, so a crafted
 * link can't turn the login page into an open redirect.
 */
export const DEFAULT_DESTINATION = "/portal/home";

/**
 * Sanitizes a `next` that may legitimately point at either surface.
 *
 * `safePortalDestination` and `safeMyDestination` each know one area and send
 * everything else to their own home. The auth routes serve both -- an invite
 * lands a new administrator on `/portal/set-password`, and since #1161 a
 * password reset can land a constituent back in `/my` -- so they need a check
 * that keeps a path in either area and refuses everything that is not a path.
 *
 * The protocol-relative cases are why this exists rather than a
 * `startsWith("/")` test: `new URL("//evil.example", origin)` resolves to
 * *another origin*, so `/auth/confirm?next=//evil.example` sent the browser
 * off-site on the back of a successful token verification.
 */
export function safeSiteDestination(
  next: string | null | undefined,
  fallback: string,
): string {
  if (!next) return fallback;
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return fallback;
  }
  return next;
}

export function safePortalDestination(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION;
  // "//evil.example" and "/\evil.example" are protocol-relative URLs, not
  // paths, and browsers treat them as off-site.
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return DEFAULT_DESTINATION;
  }
  if (next !== "/portal" && !next.startsWith("/portal/")) {
    return DEFAULT_DESTINATION;
  }
  // Nothing to come back to -- these are the pages that do the redirecting.
  if (
    next.startsWith("/portal/login") ||
    next.startsWith("/portal/set-password")
  ) {
    return DEFAULT_DESTINATION;
  }
  return next;
}

/**
 * Where `/portal/set-password` sends the browser once the password is set.
 *
 * A parameter rather than the hardcoded `/portal/home` it used to be (#1161).
 * That page requires a session and no role, so it already served both kinds of
 * account -- but it always finished at the dashboard, which bounces anyone
 * without a role straight back out to the no-access screen. A constituent
 * resetting their password from `/my/sign-in` would have read that as the
 * reset having failed.
 *
 * Narrow on purpose: the value reaches the page from a query string, so
 * anything that is not one of the two destinations it actually serves falls
 * back to the portal dashboard.
 *
 * It lives here rather than beside the form it configures because the *page*
 * calls it, and the form is a `"use client"` module: a server component
 * importing a plain function from a client module gets a client reference, not
 * the function, and calling it throws at render. That failure is invisible to
 * types and to unit tests -- it took a 500 in a browser to find.
 */
export type SetPasswordDestination = "/portal/home" | "/my";

export function safeSetPasswordDestination(
  next: string | null | undefined,
): SetPasswordDestination {
  return next === "/my" ? "/my" : "/portal/home";
}
