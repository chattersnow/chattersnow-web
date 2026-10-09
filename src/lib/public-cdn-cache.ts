/**
 * Which public pages Vercel's CDN may hold, and for how long (#1467).
 *
 * Every public page renders per request -- the tenant comes from the host --
 * so without this each crawler and each visitor recomputed copy that changes a
 * few times a year. The CDN keys on host and path, so tenants stay separate
 * without the pages having to stop reading the host.
 *
 * An allowlist, not a denylist, because a page is only safe to share between
 * visitors when nothing on it depends on who is asking. Every page here was
 * checked for that: no form (a Server Action's form carries per-build ids and
 * a rate-limit story of its own), no session read, and no per-request value
 * such as the time. The ones left out and why:
 *
 *   - `/events/e/<id>` shows a signed-in constituent their own registration;
 *   - `/contact`, `/get-involved/*` below the landing, `/inventory/donate`,
 *     `/inventory` (the catalog, with its request form), `/support/*` below
 *     the landing and `/waiver` are forms;
 *   - `/my/*` and the `confirm-*` pages are one person's.
 *
 * Adding a page here is a claim that it renders the same for everyone on its
 * host. The header's account control is the one per-person thing in the public
 * layout, and it reads the session in the browser for exactly this reason.
 */
const CACHEABLE_PATHS = new Set([
  "/home",
  "/about",
  "/about/mission",
  "/about/story",
  "/about/team",
  "/accessibility",
  "/brand",
  "/business",
  "/code-of-conduct",
  "/events",
  "/events/community",
  "/get-involved",
  "/inventory/sizing",
  "/learn",
  "/modules",
  "/nonprofits",
  "/pricing",
  "/privacy",
  "/programs",
  "/support",
  "/terms",
]);

/** Articles under `/learn/<slug>`: one segment, nothing deeper. */
const LEARN_ARTICLE = /^\/learn\/[^/]+$/;

/**
 * A minute fresh, then served stale for up to ten while one request refreshes
 * it in the background.
 *
 * Short on purpose. Nothing purges these when a page is edited in the portal,
 * so this is how long an editor waits to see their change -- a minute reads as
 * "it saved", where an hour reads as a bug. It is still enough: the cost this
 * answers was a scraper and crawlers re-requesting the same few pages, which a
 * minute's cache collapses to about one render per page per host per minute.
 */
export const PUBLIC_CDN_CACHE_CONTROL =
  "s-maxage=60, stale-while-revalidate=600";

/** The CDN directive for this public path, or null to leave it uncached. */
export function publicCdnCacheControl(pathname: string): string | null {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return CACHEABLE_PATHS.has(path) || LEARN_ARTICLE.test(path)
    ? PUBLIC_CDN_CACHE_CONTROL
    : null;
}
