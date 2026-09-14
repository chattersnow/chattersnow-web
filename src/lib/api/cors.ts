import "server-only";
import type { SupabaseClient } from "@/lib/supabase/types";

/**
 * Cross-origin rules for the public API (#813 Phase 3).
 *
 * **Reads are open.** `Access-Control-Allow-Origin: *` on every GET, because
 * the rows behind them are the same rows the tenant's own website shows
 * anybody. An allow-list on a public read would be security theatre: anything
 * that is not a browser ignores CORS entirely, so the only person it would
 * inconvenience is a customer whose embed stopped working.
 *
 * **Writes are allow-listed, for the tenant's sake rather than the
 * database's.** `tenants.allowed_origins` (`20260916040000`) is what stops
 * somebody embedding an organization's volunteer form on a page that
 * organization has never seen and collecting real applications into their real
 * database under their real name. It is not what stops abuse -- CORS is a rule
 * browsers keep, and `curl` sends no `Origin` at all. What limits abuse is
 * `check_rate_limit()`, which every intake RPC still calls with the caller's
 * IP.
 *
 * A request with no `Origin` is therefore allowed to post: refusing it would
 * block server-to-server integrations while blocking no attacker, since
 * anything that chooses not to send an `Origin` is by definition not a browser
 * enforcing this.
 */

/** No `Vary: Origin` needed: the answer is the same for every origin. */
export const READ_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type, if-none-match",
  "access-control-max-age": "86400",
};

/**
 * Write CORS for one allowed origin. `Vary: Origin` matters here -- the answer
 * differs per origin, and a shared cache that missed that would hand one
 * customer's embed another customer's allowance.
 */
export function writeCorsHeaders(
  origin: string | null,
): Record<string, string> {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/**
 * Whether this origin may post to the resolved tenant.
 *
 * Asks the database one boolean about one origin
 * (`public_origin_allowed()`): the allow-list is a map of an organization's
 * embeds and is never served. A read that errors answers `false` -- a write
 * refused because the check was unavailable is recoverable, a write accepted
 * from an origin nobody vouched for is not.
 */
export async function originAllowed(
  supabase: SupabaseClient,
  origin: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("public_origin_allowed", {
    p_origin: origin,
  });

  if (error) {
    console.error("[api] could not check the origin allow-list", error);
    return false;
  }
  return data === true;
}
