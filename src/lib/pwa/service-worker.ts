import { isPortalHost } from "@/lib/portal/paths";

/**
 * Registering and unwinding the portal's service worker (#1083).
 *
 * The worker itself is `public/sw.js`; this is the page's half of the
 * contract -- who registers it, over what, and what has to be thrown away on
 * sign-out.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/**
 * The paths the worker is allowed to control, which are exactly the portal's.
 *
 * Host-aware for the same reason the manifest's `scope` is: on a `portal.`
 * host the proxy serves the portal from `/`, and everywhere else it is under
 * `/portal`. Registering `/` on a public host would hand the worker the
 * marketing site as well -- pages nobody installs, cached by a worker whose
 * whole justification is the installed app.
 *
 * Trailing slash on purpose: a registration scope is matched as a string
 * prefix, so `/portal` would also claim a future `/portal-status` page.
 */
export function serviceWorkerScope(hostname: string): string {
  return isPortalHost(hostname) ? "/" : "/portal/";
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
 * Called on sign-out. Nothing authenticated is ever put in a cache to begin
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
export async function clearPortalCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Nothing to
    // report: the caller is on its way to the login page either way.
  }
}
