// The portal is a route group (`src/app/portal/*`) that is also served from
// its own hostname. On that hostname the `/portal` prefix is an internal
// implementation detail: the proxy rewrites `/home` -> `/portal/home` on the
// way in, so every visible URL should be prefix-free. App code still links to
// the canonical `/portal/...` paths -- those keep working on every host --
// which is why both directions of the translation live here.

export const PORTAL_PATH_PREFIX = "/portal";

export const PORTAL_HOST = "portal.chattersnow.org";

export const PUBLIC_HOSTS = new Set(["chattersnow.org", "www.chattersnow.org"]);

export function isPortalPathname(pathname: string): boolean {
  return (
    pathname === PORTAL_PATH_PREFIX ||
    pathname.startsWith(`${PORTAL_PATH_PREFIX}/`)
  );
}

/** Visible path on the portal host -> canonical app path. */
export function toPortalPathname(pathname: string): string {
  if (isPortalPathname(pathname)) return pathname;
  return pathname === "/"
    ? PORTAL_PATH_PREFIX
    : `${PORTAL_PATH_PREFIX}${pathname}`;
}

/** Canonical app path -> visible path on the portal host. */
export function stripPortalPrefix(pathname: string): string {
  if (!isPortalPathname(pathname)) return pathname;
  return pathname.slice(PORTAL_PATH_PREFIX.length) || "/";
}

/**
 * Origin that portal links in outbound email must point at. The session
 * cookie is set on whichever host completes the auth exchange, so an invite
 * that lands on the public host leaves the recipient signed in there and
 * still signed out on the portal host. Falls back to the site origin for
 * local dev and previews, where the portal shares one host with the site.
 */
export function getPortalOrigin(): string | undefined {
  return process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
}
