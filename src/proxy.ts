import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_HOSTS = new Set(["chattersnow.org", "www.chattersnow.org"]);
const PORTAL_HOST = "portal.chattersnow.org";

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
async function refreshPortalSession(request: NextRequest) {
  let refreshedResponse = NextResponse.next({ request });

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
          refreshedResponse = NextResponse.next({ request });
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
  const isPortalPath =
    pathname === "/portal" || pathname.startsWith("/portal/");
  const isPortalRequest = hostname === PORTAL_HOST || isPortalPath;

  const refreshedResponse = isPortalRequest
    ? await refreshPortalSession(request)
    : NextResponse.next({ request });

  const withRefreshedCookies = (response: NextResponse) => {
    refreshedResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  if (hostname === PORTAL_HOST) {
    if (isPortalPath) {
      return refreshedResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = `/portal${pathname}`;
    return withRefreshedCookies(NextResponse.rewrite(url, { request }));
  }

  if (PRODUCTION_HOSTS.has(hostname) && isPortalPath) {
    const url = request.nextUrl.clone();
    url.host = PORTAL_HOST;
    url.pathname = pathname.slice("/portal".length) || "/";
    return withRefreshedCookies(NextResponse.redirect(url, 308));
  }

  return refreshedResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
