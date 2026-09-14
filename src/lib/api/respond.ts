import "server-only";
import { createHash } from "node:crypto";

/**
 * How long a CDN may serve a read of the public API without asking again, and
 * how long it may keep serving a stale copy while it does (#813 Phase 3).
 *
 * A minute is short enough that an organization publishing a correction sees
 * it on an embed about as fast as on its own site, and long enough that an
 * embed on a busy page costs one Supabase request a minute rather than one per
 * visitor -- which is the whole of the free-tier argument, since Supabase's
 * limits are about sustained request rate and this layer's traffic is
 * overwhelmingly repeat reads of the same handful of documents.
 *
 * Phase 4 replaces the guesswork with an `ETag` that moves when content is
 * published. The `ETag` below is already sent and already answers
 * `If-None-Match`, so a consumer that revalidates pays headers and no body;
 * what Phase 4 adds is a version a consumer can poll cheaply.
 */
export const READ_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

/**
 * A weak `ETag` over the serialized body.
 *
 * Weak because it is a hash of *this* representation rather than a statement
 * about the underlying rows: two byte-identical bodies are the same answer,
 * which is all a conditional GET needs. SHA-1 truncated to 16 hex characters
 * -- this is a cache key, not a signature, and nothing downstream trusts it.
 */
export function etagFor(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
}

/**
 * A cacheable JSON read, with a conditional-GET short circuit.
 *
 * `If-None-Match` is answered with a bodiless 304 carrying the same `ETag` and
 * `Cache-Control`, because a 304 that drops the caching headers tells the next
 * hop nothing and it asks again immediately.
 */
export function readResponse(
  data: unknown,
  request: Request,
  headers: Record<string, string> = {},
): Response {
  const body = JSON.stringify(data);
  const etag = etagFor(body);
  const common = {
    "cache-control": READ_CACHE_CONTROL,
    etag,
    ...headers,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: common });
  }

  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...common },
  });
}

/**
 * A write's answer. Never cached: a POST's response describes one submission,
 * and the next identical post is a different submission.
 */
export function writeResponse(
  data: unknown,
  status = 201,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

/**
 * An error. Also never cached -- a 404 for a tenant that is about to be
 * provisioned, or a 429 that is about to expire, must not be held by a CDN.
 */
export function errorResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}
