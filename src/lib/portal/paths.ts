// The portal is a route group (`src/app/portal/*`) that is also served from
// its own hostname. On that hostname the `/portal` prefix is an internal
// implementation detail: the proxy rewrites `/home` -> `/portal/home` on the
// way in, so every visible URL should be prefix-free. App code still links to
// the canonical `/portal/...` paths -- those keep working on every host --
// which is why both directions of the translation live here.

export const PORTAL_PATH_PREFIX = "/portal";

export const PORTAL_HOST = "portal.chattersnow.org";

export const PUBLIC_HOSTS = new Set(["chattersnow.org", "www.chattersnow.org"]);

/**
 * Any `portal.` subdomain is a portal host (#707 Phase 4). A tenant on its own
 * domain points `portal.<domain>` at the same deployment and gets the same
 * unprefixed portal the Chatter Snow host has; `public_tenant_id()` resolves it
 * through the parent-domain match on `tenants.custom_domain`. The proxy's apex
 * -> portal redirect stays Chatter Snow's own: it assumes the subdomain exists,
 * which only that tenant's DNS has promised.
 *
 * It lives here, next to the path helpers, rather than in the proxy, so that
 * the client-side canonicalizer decides what a portal host is the same way the
 * proxy does -- they disagreed until #772, leaving the `/portal` prefix visible
 * on a tenant's own host.
 */
export function isPortalHost(hostname: string): boolean {
  return hostname === PORTAL_HOST || hostname.startsWith("portal.");
}

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
