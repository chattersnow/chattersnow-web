import { timingSafeEqual } from "node:crypto";

/**
 * The bearer check every scheduled route shares (#488, extracted for #743).
 *
 * Its own module so the interesting part is a plain unit test rather than an
 * HTTP one -- the same split as `resolveDestination` in
 * src/app/auth/callback/route.ts -- and so the second cron route inherits the
 * exact check rather than a copy of it.
 *
 * Refuses outright when no secret is configured. A route that defaults to open
 * because someone forgot an environment variable is worse than one that never
 * runs: the failure is silent and the endpoint is public.
 */
export function isAuthorizedCronRequest(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;

  const provided = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual throws on a length mismatch, so length has to be compared
  // first -- and length is not the secret, so comparing it plainly is fine.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
