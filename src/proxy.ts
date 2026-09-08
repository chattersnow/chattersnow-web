import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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
 * Header carrying the portal path the browser actually asked for.
 *
 * The portal layout redirects signed-out users to the login page, but a
 * layout can't see the request path, so every shared portal link -- "look at
 * this event", "here's the reimbursement" -- used to land the recipient on
 * the dashboard with the original URL gone. The proxy does see it.
 */
export const PORTAL_PATH_HEADER = "x-portal-path";

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
function forwardHeaders(request: NextRequest, portalPath: string | null) {
  const headers = new Headers(request.headers);
  if (portalPath) {
    headers.set(PORTAL_PATH_HEADER, portalPath);
  } else {
    // Never let a client-supplied value through: it decides a redirect target.
    headers.delete(PORTAL_PATH_HEADER);
  }
  return headers;
}

async function refreshPortalSession(
  request: NextRequest,
  portalPath: string | null,
) {
  const forward = () =>
    NextResponse.next({
      request: { headers: forwardHeaders(request, portalPath) },
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

  const refreshedResponse = isPortalRequest
    ? await refreshPortalSession(request, portalPath)
    : NextResponse.next({
        request: { headers: forwardHeaders(request, portalPath) },
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
        request: { headers: forwardHeaders(request, portalPath) },
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
