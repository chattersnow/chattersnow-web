import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_HOSTS = new Set(["chattersnow.org", "www.chattersnow.org"]);
const PORTAL_HOST = "portal.chattersnow.org";

// Refreshes the Supabase session on every request and forwards the rotated
// cookies to both the downstream request and the browser response. Without
// this, session refreshes triggered from a Server Component (via
// createSupabaseServerClient) can't persist their Set-Cookie writes (Next.js
// forbids cookie writes during RSC render), which strands the browser with a
// refresh token GoTrue has already rotated/consumed server-side, so the very
// next request appears signed out.
export async function proxy(request: NextRequest) {
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

  await supabase.auth.getUser();

  const hostname = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const isPortalPath =
    pathname === "/portal" || pathname.startsWith("/portal/");

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
