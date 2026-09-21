import { isPortalHost, portalRedirectTarget } from "@/lib/portal/paths";
import type { AppSurface } from "@/lib/pwa/manifest";

/**
 * Which of the two apps a host serves, and where each of them starts (#1171).
 *
 * The manifest builder and the service-worker scope both need the same fact --
 * does this surface have the origin root to itself -- and both are kept pure so
 * they can be tested without a request. This is where the request host is
 * turned into that boolean, from the helpers that already decide the portal's
 * URLs (`src/lib/portal/paths.ts`) rather than from a second host rule.
 */

/**
 * True when `surface` owns `/` on this host.
 *
 *   - The portal owns the root on a `portal.` host, where the proxy strips the
 *     `/portal` prefix off every visible URL.
 *   - The public site owns the root on a host that has promised a portal
 *     subdomain of its own (`PORTAL_REDIRECT_HOSTS`), because `/portal/*` 308s
 *     away from there and nothing else is served under it.
 *   - Neither owns the root on a host that serves both from one origin -- the
 *     demo tenant, a preview, a local run. The portal stays under `/portal`
 *     and the public app narrows to `/my`, so the two `scope`s do not overlap.
 */
export function surfaceAtRoot(surface: AppSurface, hostname: string): boolean {
  if (surface === "portal") return isPortalHost(hostname);
  return portalRedirectTarget(hostname) !== null;
}

/**
 * Whether the public app is installable on this host at all.
 *
 * A `portal.` host serves no public page -- the proxy rewrites the whole
 * marketing tree into `/portal/*` -- so a public manifest there would describe
 * an app with nothing in it, and claim the same `id` as the portal's.
 */
export function servesPublicApp(hostname: string): boolean {
  return !isPortalHost(hostname);
}
