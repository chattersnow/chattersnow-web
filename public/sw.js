/*
 * The installed portal's service worker (#1083).
 *
 * A service worker is a cache that outlives a deploy, so the governing rule
 * here is how little it is allowed to keep rather than how much it can. It
 * caches exactly one class of response -- `/_next/static/*`, which is
 * content-hashed and therefore immutable -- plus a tenant-neutral offline
 * page, and passes everything else straight to the network without so much as
 * a `respondWith`.
 *
 * Specifically it never touches:
 *   - any document, RSC payload or Server Action response. They are per
 *     session and per role, and a cached HTML document is how an installed app
 *     serves a signed-out shell to a signed-in user -- or one member's page to
 *     the next person who opens the phone.
 *   - `/api/*`, for the same reason, the cron routes included.
 *   - anything that is not a GET.
 *
 * A stale donation total or an out-of-date check-in list is worse than a
 * spinner, so there is no read-through cache for portal data at all, and
 * offline is honest failure (see `offline.html` and the portal's offline
 * banner) rather than a plausible-looking stale page.
 *
 * Plain JS in `public/` rather than a bundled route, because a service worker
 * is fetched by the browser at a fixed URL with its own scope rules and has no
 * build step worth having. Bump CACHE_VERSION whenever this file changes.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `portal-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

/**
 * Puts the offline page in the cache, unless it is already there.
 *
 * Called on install and again after every successful navigation, which is not
 * belt and braces: signing out deletes every cache (see below), and this
 * worker is not reinstalled by that -- so without the second call the offline
 * page would be missing for the whole of the next session, and the one thing
 * the worker exists to show would be the thing it could not.
 *
 * Never rejects: a failure here must not fail an install or a navigation.
 */
function ensureOfflinePage() {
  return caches
    .open(STATIC_CACHE)
    .then((cache) =>
      cache
        .match(OFFLINE_URL)
        .then((hit) =>
          hit
            ? undefined
            : cache.add(new Request(OFFLINE_URL, { cache: "reload" })),
        ),
    )
    .catch(() => undefined);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    ensureOfflinePage()
      // Take over as soon as the new worker is ready rather than waiting for
      // every tab to close: an installed app is rarely closed, and a worker
      // that waits is how a deploy fails to reach the people who installed it.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("portal-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Sign-out clears every cache, but it does it from the page rather than by
// messaging this worker (`clearPortalCaches` in src/lib/pwa/service-worker.ts).
// CacheStorage is per origin, not per worker, so the page can do it directly --
// and a sign-out must not depend on a worker being alive to answer.

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Content-hashed and immutable: a hit is always correct, and a deploy
  // changes the filename rather than the contents. This is the whole of the
  // "precache the app shell" story -- these chunks *are* the shell.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Documents: network only, with the offline page as the failure face. Never
  // cached, so the installed app can never show a stale or signed-out shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Off the response path: the page is already on its way.
          event.waitUntil(ensureOfflinePage());
          return response;
        })
        .catch(() =>
          caches.match(OFFLINE_URL).then(
            (cached) =>
              cached ??
              new Response("You are offline.", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              }),
          ),
        ),
    );
    return;
  }

  // Everything else -- RSC payloads, /api, images, fonts from elsewhere --
  // is left to the browser untouched.
});
