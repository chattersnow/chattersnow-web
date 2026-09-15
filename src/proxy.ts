import { createServerClient } from "@supabase/ssr";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import {
  isPortalHost,
  isPortalPathname,
  portalRedirectTarget,
  stripPortalPrefix,
} from "@/lib/portal/paths";

// Paths that live at the app root and must keep working unprefixed on the
// portal host. `/portal` is a route-group prefix, not a mount point, so
// blanket-rewriting every path into it makes these unreachable:
//   - /auth/* is the Supabase OAuth/email callback. The session cookie has to
//     be set on the portal host, so the provider redirect must land here --
//     but /portal/auth/callback doesn't exist, so it 404s and Google sign-in
//     never completes.
//   - files in public/ (the logo on the login page). next/image is exempt from
//     the matcher, but the optimizer re-fetches the source through this same
//     host, so a rewritten /portal/<file>.png 404 turns into a 400
//     INVALID_IMAGE_OPTIMIZE_REQUEST and the image never renders.
//   - /api/* are route handlers, which live at the app root. The task-reminder
//     cron (#488) is called by Vercel with a bearer token and no browser
//     involved, so a rewrite to /portal/api/... would 404 a job nobody is
//     watching -- it would simply stop sending, silently.
const ROOT_PATH_PREFIXES = ["/auth/", "/api/"];

/**
 * The public site's event URLs, for the legacy `/events/<uuid>` 308 (#1003).
 *
 * This redirect lived in `next.config.ts` until it took the portal down
 * (#1145). Events moved a segment down to `/events/e/<uuid>` because the
 * intercepting sheet matched every single segment under /events, and the old
 * URL had to keep working -- but `next.config.ts` redirects are host-blind and
 * are applied ahead of this proxy, and on a `portal.` host the portal's own
 * visible event URL *is* `/events/<uuid>`, because the `/portal` prefix is
 * stripped here. So the two collided: a click on the portal's event list went
 * `/portal/events/<uuid>` -> 307 `/events/<uuid>` -> 308 `/events/e/<uuid>`,
 * which this proxy then rewrote to `/portal/events/e/<uuid>` -- no such route,
 * 404. It reproduced on the portal hosts alone, which is why previews, the
 * demo tenant (`/portal` is a real path segment there) and every local run
 * looked fine.
 *
 * Living here rather than in `next.config.ts` is the fix: this is the one
 * module that already knows what a portal host is, so the public site's
 * redirects cannot be written in ignorance of the portal's paths again. It is
 * still a real 308 issued before any rendering, which is what a crawler needs
 * to move the link equity over.
 */
const PUBLIC_EVENT_PATH = /^\/events\/([0-9a-fA-F-]{36})\/?$/;

/**
 * The same URL one segment down -- what a browser that cached the 308 above
 * asks the portal for, possibly forever.
 *
 * The redirect went out as `permanent`, so fixing the collision is not enough
 * on its own: every browser that has already followed it has
 * `/events/<uuid>` -> `/events/e/<uuid>` burned into its cache, and would keep
 * 404ing on a portal host long after this deploy. Absorbing that path here
 * serves those browsers the event they asked for. It has to be a rewrite and
 * not a redirect back: redirecting to `/events/<uuid>` would meet the cached
 * 308 coming the other way and spin.
 */
const PORTAL_CACHED_EVENT_PATH = /^\/events\/e\/([0-9a-fA-F-]{36})\/?$/;

/**
 * Header carrying the portal path the browser actually asked for.
 *
 * The portal layout redirects signed-out users to the login page, but a
 * layout can't see the request path, so every shared portal link -- "look at
 * this event", "here's the reimbursement" -- used to land the recipient on
 * the dashboard with the original URL gone. The proxy does see it.
 */
export const PORTAL_PATH_HEADER = "x-portal-path";

/**
 * Header carrying which shell the portal should render (#1079).
 *
 * `useIsMobile()` deliberately answers `false` on the server so hydration is
 * safe, which means it can never choose a *shell*: the first paint would
 * always be the desktop one and swap afterwards, flashing on every navigation
 * and shipping both trees. The proxy is the one place that sees the request
 * before anything renders, so the decision is made here and read once, by
 * `deviceClass()` in `src/lib/portal/device.ts`.
 *
 * The portal is authenticated and fully dynamic, so there is no CDN cache to
 * `Vary` on. If anything under `/portal` ever becomes cacheable, it has to
 * vary on this header.
 */
export const DEVICE_HEADER = "x-device";

/**
 * Cookie that overrides the user-agent's answer.
 *
 * UA sniffing gets desktop-mode phones and tablets wrong, and there is no
 * server-side way to see a viewport. One client effect can write the real
 * width into this cookie after first load, so the *next* request is right even
 * where the UA is not -- and a Playwright run can force either shell by
 * setting it, with no UA spoofing.
 */
export const DEVICE_OVERRIDE_COOKIE = "device_override";

export type DeviceClass = "mobile" | "desktop";

/**
 * The shell decision, from the UA's device type and the override cookie.
 *
 * Tablets resolve to `desktop`: they have room for the sidebar, and the
 * mobile shell's bottom tab bar is a thumb-reach affordance that a 10" screen
 * does not want. `userAgent().device.type` is `undefined` on desktop, so
 * anything that isn't explicitly a phone falls through to the desktop shell --
 * the safe direction, since that is the layout every existing test expects.
 */
export function resolveDeviceClass(
  deviceType: string | undefined,
  override: string | undefined,
): DeviceClass {
  if (override === "mobile" || override === "desktop") return override;
  return deviceType === "mobile" ? "mobile" : "desktop";
}

export type PortalRoute =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; host: string; pathname: string; status: 307 | 308 };

// Pure host/path routing decision, split out so it can be unit tested without
// a real request (fetch's Headers refuses to carry a `host` header).
//
// `isNonDocumentRequest` marks anything that isn't a page load the user can
// see: RSC payload fetches and Server Action POSTs. Those skip the cosmetic
// prefix-strip below -- there's no address bar to clean up, redirecting a
// prefetch would double every navigation request, and bouncing an action POST
// asks fetch to replay a body it may not be able to rewind.
export function resolvePortalRoute(
  hostname: string,
  pathname: string,
  isNonDocumentRequest = false,
): PortalRoute {
  const isPortalPath = isPortalPathname(pathname);

  if (isPortalHost(hostname)) {
    const isRootPath =
      ROOT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
      // Anything with a file extension is a public/ asset, never a page route.
      /\.[^/]+$/.test(pathname);

    if (isRootPath) {
      return { kind: "pass" };
    }

    // The prefix is internal here, so send the browser to the bare path and
    // let the rewrite below put it back. App code keeps linking to the
    // canonical `/portal/...` paths, which still resolve on every host; this
    // is what stops them showing up as portal.chattersnow.org/portal/home.
    // 307 rather than 308: nothing about the split is settled enough to want
    // it burned into browser caches.
    //
    // The redirect stays on the host it arrived at: a tenant reaching its own
    // portal.<domain> has to stay there. Sending it to another tenant's portal
    // host would drop the tenant `public_tenant_id()` resolves from the
    // hostname, and strand the session cookie on a domain the visitor never
    // asked for.
    if (isPortalPath) {
      return isNonDocumentRequest
        ? { kind: "pass" }
        : {
            kind: "redirect",
            host: hostname,
            pathname: stripPortalPrefix(pathname),
            status: 307,
          };
    }

    // Ahead of the blanket rewrite below, which would send this to
    // `/portal/events/e/<uuid>` -- the 404 that #1145 was.
    const cached = PORTAL_CACHED_EVENT_PATH.exec(pathname);
    if (cached) {
      return { kind: "rewrite", pathname: `/portal/events/${cached[1]}` };
    }

    return { kind: "rewrite", pathname: `/portal${pathname}` };
  }

  // The apex -> portal 308, for the hosts that have said they have a portal
  // subdomain (PORTAL_REDIRECT_HOSTS). A host that has not is left alone and
  // serves /portal/... as a path, which is what a preview and a local run do.
  const portalHost = isPortalPath ? portalRedirectTarget(hostname) : null;
  if (portalHost) {
    return {
      kind: "redirect",
      host: portalHost,
      pathname: stripPortalPrefix(pathname),
      status: 308,
    };
  }

  // The public site's legacy event URL. Deliberately after the portal branch
  // above, so it can never fire on a host where `/events/<uuid>` is a portal
  // page rather than a public one.
  const legacyEvent = PUBLIC_EVENT_PATH.exec(pathname);
  if (legacyEvent) {
    return {
      kind: "redirect",
      host: hostname,
      pathname: `/events/e/${legacyEvent[1]}`,
      status: 308,
    };
  }

  return { kind: "pass" };
}

// Refreshes the Supabase session for portal requests and forwards any
// rotated cookies to both the downstream request and the browser response.
// Without this, a session refresh triggered from a Server Component (e.g.
// getUser() in the portal layout) can't persist its own Set-Cookie writes
// (Next.js forbids cookie writes during RSC render), which strands the
// browser with a refresh token GoTrue has already rotated/consumed
// server-side, so the very next request appears signed out.
//
// Uses getSession() rather than getUser(): getSession() only touches the
// network when the access token is actually expired (which is exactly when
// a refresh -- the thing we need to persist -- happens), whereas getUser()
// always makes a round trip to revalidate the JWT. Proxy runs on every
// request, so that difference matters; the portal layout still calls
// getUser() itself for the real authorization check, once the cookies here
// are already current.
/**
 * Clones the incoming headers and stamps the requested portal path on them.
 * Cloned at call time, never snapshotted up front: `request.cookies.set` in
 * the refresh path below writes through `request.headers`, so an early copy
 * would forward a stale cookie header and undo the session refresh.
 */
function forwardHeaders(
  request: NextRequest,
  portalPath: string | null,
  device: DeviceClass | null,
) {
  const headers = new Headers(request.headers);
  if (portalPath) {
    headers.set(PORTAL_PATH_HEADER, portalPath);
  } else {
    // Never let a client-supplied value through: it decides a redirect target.
    headers.delete(PORTAL_PATH_HEADER);
  }
  if (device) {
    headers.set(DEVICE_HEADER, device);
  } else {
    // Same reason: it decides which shell renders, so the only value the app
    // ever sees is the one stamped here.
    headers.delete(DEVICE_HEADER);
  }
  return headers;
}

async function refreshPortalSession(
  request: NextRequest,
  portalPath: string | null,
  device: DeviceClass | null,
) {
  const forward = () =>
    NextResponse.next({
      request: { headers: forwardHeaders(request, portalPath, device) },
    });
  let refreshedResponse = forward();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          refreshedResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshedResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getSession();

  return refreshedResponse;
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const route = resolvePortalRoute(
    hostname,
    pathname,
    request.method !== "GET" ||
      request.headers.has("rsc") ||
      request.headers.has("next-action"),
  );
  // isPortalHost covers main's `hostname === PORTAL_HOST` and generalizes it to
  // any `portal.` subdomain (#707 Phase 4); isPortalPathname is the helper form
  // of the inline prefix check this used to carry.
  const isPortalRequest = isPortalHost(hostname) || isPortalPathname(pathname);

  // The path as the browser asked for it. On the portal host the route group
  // is a rewrite target, so use the rewritten path -- that's what a login
  // redirect has to send the user back to.
  const portalPath = isPortalRequest
    ? `${route.kind === "rewrite" ? route.pathname : pathname}${request.nextUrl.search}`
    : null;

  // Portal requests only: the public site is one responsive tree and has no
  // shell to choose, so stamping it there would only invite a second reader.
  const device = isPortalRequest
    ? resolveDeviceClass(
        userAgent(request).device.type,
        request.cookies.get(DEVICE_OVERRIDE_COOKIE)?.value,
      )
    : null;

  const refreshedResponse = isPortalRequest
    ? await refreshPortalSession(request, portalPath, device)
    : NextResponse.next({
        request: { headers: forwardHeaders(request, portalPath, device) },
      });

  const withRefreshedCookies = (response: NextResponse) => {
    refreshedResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return withRefreshedCookies(
      NextResponse.rewrite(url, {
        request: { headers: forwardHeaders(request, portalPath, device) },
      }),
    );
  }

  if (route.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.host = route.host;
    url.pathname = route.pathname;
    return withRefreshedCookies(NextResponse.redirect(url, route.status));
  }

  return refreshedResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
