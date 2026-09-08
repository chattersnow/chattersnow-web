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

/** Where the portal login's link back to the organization's public site goes. */
export type PublicSiteLink = { href: string; label: string };

/**
 * The public site to offer a signed-out visitor on the portal login, or null
 * when there is none to offer (#795 Phase 2).
 *
 * This used to be a hardcoded `/home` labelled "Back to chattersnow.org", and
 * both halves were wrong. The label named one tenant's domain on every
 * tenant's login page; the href was dead on every portal host, because the
 * proxy rewrites an unprefixed path into `/portal/*` -- so `/home` resolved to
 * the portal dashboard and bounced the visitor back to the login page.
 *
 * Three cases, in this order:
 *
 *   1. Not a portal host (localhost, a preview, the public host itself): the
 *      relative link works and is the right one -- it keeps a visitor on
 *      `uat.chattersnow.org` on uat rather than sending them to production.
 *   2. A portal host, tenant has a public domain: an absolute link to it.
 *   3. A portal host, and the tenant's own `custom_domain` is a portal host --
 *      the platform tenant, whose domain is `portal.rickiecruz.com` because the
 *      rickiecruz.com apex is the consulting site and is not served here. There
 *      is no public site, so nothing is offered rather than a link off the
 *      deployment.
 */
export function publicSiteLink(
  requestHost: string,
  tenant: { name: string; custom_domain: string | null } | null,
): PublicSiteLink | null {
  const domain =
    tenant?.custom_domain && !isPortalHost(tenant.custom_domain)
      ? tenant.custom_domain
      : null;
  const label = domain ?? tenant?.name;
  if (!label) return null;
  if (!isPortalHost(requestHost)) return { href: "/home", label };
  if (!domain) return null;
  return { href: `https://${domain}/home`, label: domain };
}
