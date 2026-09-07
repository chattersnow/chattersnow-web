/**
 * Sanitizes a `next` destination before it's used as a redirect target.
 *
 * Only same-site portal paths are honoured: anything absolute, protocol
 * relative, or outside /portal falls back to the dashboard, so a crafted
 * link can't turn the login page into an open redirect.
 */
export const DEFAULT_DESTINATION = "/portal/home";

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
