import "server-only";

/**
 * The two things the write handlers need from the request itself
 * (#813 Phase 3).
 *
 * `@/lib/get-client-ip` and `@/lib/request-origin` answer the same questions
 * through `next/headers`, because a Server Action has no `Request` to read --
 * it is called with the form's arguments and nothing else. A route handler
 * does have one, so it reads the headers it was handed rather than reaching
 * for a dynamic API. That is simpler, and it is what makes every handler in
 * this layer a plain function of a `Request` that a test can call directly.
 */

/**
 * The caller's address, forwarded into `p_ip_address` so `check_rate_limit()`
 * counts per caller rather than per deployment.
 *
 * Vercel sets `x-forwarded-for` at the edge and the first entry is the
 * original client. A consumer's own proxy may prepend to it, which is why only
 * the first entry is taken: the rest are hops, and a hop is not who to limit.
 */
export function clientIpFrom(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

/**
 * The origin to build links from in mail this request causes.
 *
 * A *fallback* only, and rarely the one used: since #860 a tenant with a
 * `custom_domain` is linked to its own domain, which is the right link for a
 * message that arrived through somebody else's embed. This matters when the
 * tenant has no domain yet, and then the honest answer is wherever the API was
 * called -- not `NEXT_PUBLIC_SITE_URL`, which names one deployment.
 */
export function originFrom(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
