import type { AppSurface } from "@/lib/pwa/manifest";

/**
 * Registering and unwinding the apps' service worker (#1083, #1171).
 *
 * The worker itself is `public/sw.js`; this is the page's half of the
 * contract -- who registers it, over what, and what has to be thrown away on
 * sign-out. One worker file serves both surfaces: what it caches is immutable
 * chunks and a tenant-neutral offline page, which is as correct for the public
 * site as for the portal.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/**
 * The paths the worker is allowed to control, which are exactly one surface's.
 *
 * Surface- and host-aware for the same reason the manifest's `scope` is, and
 * by the same rule (`surfaceAtRoot` in `./host.ts`): a surface that owns the
 * origin root gets `/`, and one sharing the origin gets its own subtree and
 * nothing else. Registering `/` for the public app on a host that also serves
 * the portal would hand it the portal's pages as well -- two registrations
 * fighting over the same scope, where the narrower one is the one that wins.
 *
 * Trailing slash on purpose: a registration scope is matched as a string
 * prefix, so `/portal` would also claim a future `/portal-status` page.
 *
 * It has a cost worth naming: the bare `/portal` and `/my` documents are not
 * inside their own scope, so those two URLs go uncontrolled and a cold,
 * offline load of exactly them shows the browser's error page rather than
 * `/offline.html`. Everything below them is controlled, which is the whole of
 * both apps in use -- but `/my` is also the supporter app's `start_url` on a
 * shared-origin host, so launching that install with no connection is the one
 * case this gives up. Narrowing the hazard was judged the better trade; if it
 * is ever revisited, the fix is to drop the slash here rather than to move the
 * `start_url`, which would redirect on every launch.
 *
 * Pure, and takes the boolean rather than the hostname, so the server can
 * decide it once and hand it to the registrar (`src/components/pwa/`).
 */
export function serviceWorkerScope(
  surface: AppSurface,
  atRoot: boolean,
): string {
  if (atRoot) return "/";
  return surface === "portal" ? "/portal/" : "/my/";
}

/**
 * Whether this browser should get a worker at all.
 *
 * Automation never does. Both browser suites run against a production build
 * (`bun run test:e2e`, `bun run test:a11y`), so without this the worker would
 * install during the first spec and then serve cached chunks across every
 * later one -- a cache shared between tests that are supposed to be
 * independent, and a flake nobody would trace back to here. `navigator.
 * webdriver` is set by Playwright and by every other WebDriver-based runner,
 * and is false in a real browser.
 *
 * Development never does either: `/_next/static` is not immutable under the
 * dev server, so caching it fights HMR.
 */
export function shouldRegisterServiceWorker(
  nav: Pick<Navigator, "webdriver"> & { serviceWorker?: unknown },
  isProduction: boolean,
): boolean {
  if (!isProduction) return false;
  if (nav.webdriver) return false;
  return Boolean(nav.serviceWorker);
}

/**
 * Throws away everything the worker cached.
 *
 * Called on sign-out from either surface. CacheStorage is per origin, so on a
 * host that serves both this clears the other surface's cache too -- harmless,
 * because nothing authenticated is ever cached on either.
 *
 * Nothing authenticated is ever put in a cache to begin
 * with, so in practice this clears immutable chunks and the offline page --
 * but "everything the session cached is gone" is the property worth being able
 * to state plainly, and the cost of keeping it true is this function.
 *
 * The still-active worker refills the cache almost immediately with the login
 * page's own chunks, and re-primes the offline page (`ensureOfflinePage` in
 * public/sw.js) on its next successful navigation. That is the intended end
 * state: a cache that exists and belongs to nobody.
 *
 * Never throws: a sign-out that fails to clear a cache must still sign out.
 */
export async function clearAppCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Nothing to
    // report: the caller is on its way to the login page either way.
  }
}
