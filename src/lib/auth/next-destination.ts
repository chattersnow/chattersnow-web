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
