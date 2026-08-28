import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_HOSTS = new Set(["chattersnow.org", "www.chattersnow.org"]);
const PORTAL_HOST = "portal.chattersnow.org";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const isPortalPath =
    pathname === "/portal" || pathname.startsWith("/portal/");

  if (hostname === PORTAL_HOST) {
    if (isPortalPath) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/portal${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (PRODUCTION_HOSTS.has(hostname) && isPortalPath) {
    const url = request.nextUrl.clone();
    url.host = PORTAL_HOST;
    url.pathname = pathname.slice("/portal".length) || "/";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
