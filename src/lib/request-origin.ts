import { headers } from "next/headers";

/**
 * The host the browser asked for, or "" when there is no request. Split out of
 * getRequestOrigin() because the portal login needs the host itself, not an
 * origin, to decide whether it is on a portal host (#795 Phase 2).
 */
export async function getRequestHost(): Promise<string> {
  try {
    const requestHeaders = await headers();
    return (
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * The origin the browser is talking to, for links a Server Action has to
 * build (there is no `window.location` on the server).
 *
 * This used to be `NEXT_PUBLIC_SITE_URL`, one origin for the whole
 * deployment. With tenants on their own domains (#707 Phase 4) an invite
 * minted from a tenant's portal has to land on that tenant's domain, so the
 * request's own host wins and the environment variable is the fallback --
 * for a call with no request, such as a test.
 */
export async function getRequestOrigin(): Promise<string> {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  try {
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    if (!host) return fallback;
    const proto =
      requestHeaders.get("x-forwarded-proto") ??
      (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return fallback;
  }
}
