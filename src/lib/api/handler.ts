import "server-only";
import type { z } from "zod";
import { clientIpFrom, originFrom } from "@/lib/api/request";
import type { SupabaseClient } from "@/lib/supabase/types";
import { createSupabaseApiClient } from "@/lib/api/client";
import { ApiError, apiErrorFromRpc } from "@/lib/api/errors";
import {
  READ_CORS_HEADERS,
  originAllowed,
  writeCorsHeaders,
} from "@/lib/api/cors";
import { errorResponse, readResponse, writeResponse } from "@/lib/api/respond";

/**
 * The shape every `/api/v1/t/{slug}/...` route handler is built from
 * (#813 Phase 3).
 *
 * A handler is a function from a resolved tenant to a value. Everything the
 * handlers would otherwise each have to get right -- resolving the slug,
 * refusing an unknown one, validating, the error envelope, CORS, caching,
 * conditional GETs, the client IP the rate limiter counts on -- happens once,
 * here. What is left in a route file is the query.
 *
 * Nothing in this layer uses the service-role key or a session. The client is
 * `anon` and names its tenant with a header, so a handler can reach exactly
 * what a visitor to that tenant's own website can reach and nothing else.
 */

type RouteParams = Record<string, string>;

/** What Next hands a route handler as its second argument. */
type RouteContext<P extends RouteParams> = { params: Promise<P> };

type ReadHandler<P extends RouteParams> = (context: {
  supabase: SupabaseClient;
  params: P;
  searchParams: URLSearchParams;
  /** The resolved tenant, already proved to exist. */
  tenantId: string;
}) => Promise<unknown>;

type WriteHandler<P extends RouteParams, Body> = (context: {
  supabase: SupabaseClient;
  params: P;
  body: Body;
  /** Forwarded into `p_ip_address` so `check_rate_limit()` counts per caller. */
  clientIp: string | null;
  /**
   * The fallback origin for links in any mail this write causes. A tenant
   * with a `custom_domain` is linked to its own domain instead (#860).
   */
  siteUrl: string;
  /**
   * The resolved tenant. Carried explicitly for the notification hooks: a
   * volunteer reference code is unique only *within* a tenant, and the
   * service-role lookup behind the email has no RLS to keep it in one.
   */
  tenantId: string;
}) => Promise<unknown>;

/**
 * Resolves the slug in the path to a tenant, or throws the 404 the whole API
 * answers an unknown, suspended or archived tenant with.
 *
 * One extra round trip per request, deliberately. Letting a handler's own
 * query come back empty would be cheaper but wrong: an empty list is a
 * perfectly good answer for a real organization that has published no events,
 * and a consumer has to be able to tell that apart from "this slug is not
 * yours". `public_tenant_id()` is a `stable` SQL function over a unique index,
 * and a read's answer is cached for a minute anyway.
 */
async function requireTenant(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("public_tenant_id");
  if (error) {
    console.error("[api] could not resolve the tenant", error);
    throw new ApiError("server_error", "Something went wrong on our side.");
  }
  if (!data) {
    throw new ApiError("not_found", "No such organization.");
  }
  return data;
}

function handleFailure(
  failure: unknown,
  headers: Record<string, string>,
): Response {
  const apiError =
    failure instanceof ApiError
      ? failure
      : (console.error("[api] unhandled failure", failure),
        new ApiError("server_error", "Something went wrong on our side."));

  return errorResponse(apiError.body, apiError.status, {
    ...headers,
    ...(apiError.retryAfterSeconds
      ? { "retry-after": String(apiError.retryAfterSeconds) }
      : {}),
  });
}

/** A cacheable, open-CORS GET over the resolved tenant's public rows. */
export function publicRead<P extends RouteParams = { tenant: string }>(
  handler: ReadHandler<P>,
) {
  async function GET(
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> {
    try {
      const params = await context.params;
      const supabase = createSupabaseApiClient(params.tenant);
      const tenantId = await requireTenant(supabase);

      const data = await handler({
        supabase,
        params,
        searchParams: new URL(request.url).searchParams,
        tenantId,
      });

      return readResponse(data, request, READ_CORS_HEADERS);
    } catch (failure) {
      return handleFailure(failure, READ_CORS_HEADERS);
    }
  }

  function OPTIONS(): Response {
    return new Response(null, { status: 204, headers: READ_CORS_HEADERS });
  }

  return { GET, OPTIONS };
}

/**
 * A POST into one of the intake RPCs.
 *
 * The honeypot stays here rather than in the contract: it is a trick played on
 * a bot filling in a rendered form, and a field named `company` in a published
 * JSON schema is a trick played on nobody. The RPCs take it as an optional
 * argument, so the handlers simply never send one.
 */
export function publicWrite<
  Schema extends z.ZodType,
  P extends RouteParams = { tenant: string },
>(schema: Schema, handler: WriteHandler<P, z.infer<Schema>>) {
  async function POST(
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> {
    const origin = request.headers.get("origin");
    let corsHeaders: Record<string, string> = {};

    try {
      const params = await context.params;
      const supabase = createSupabaseApiClient(params.tenant);
      const tenantId = await requireTenant(supabase);

      if (origin) {
        if (!(await originAllowed(supabase, origin))) {
          throw new ApiError(
            "origin_not_allowed",
            "This origin is not allowed to post to this organization.",
          );
        }
        corsHeaders = writeCorsHeaders(origin);
      }

      let json: unknown;
      try {
        json = await request.json();
      } catch {
        throw new ApiError("invalid_request", "The body is not valid JSON.");
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError("invalid_request", "The body did not validate.", {
          fields: fieldMessages(parsed.error),
        });
      }

      const data = await handler({
        supabase,
        params,
        body: parsed.data,
        clientIp: clientIpFrom(request),
        siteUrl: originFrom(request),
        tenantId,
      });

      return writeResponse(data, 201, corsHeaders);
    } catch (failure) {
      return handleFailure(failure, corsHeaders);
    }
  }

  /**
   * Preflight. An origin that is not allow-listed gets a 204 with no
   * `Access-Control-Allow-Origin`, which is what makes the browser refuse the
   * POST that would have followed -- a 403 here would be answering a question
   * the browser did not ask.
   */
  async function OPTIONS(
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> {
    const origin = request.headers.get("origin");
    if (!origin) return new Response(null, { status: 204 });

    try {
      const params = await context.params;
      const supabase = createSupabaseApiClient(params.tenant);
      const allowed = await originAllowed(supabase, origin);
      return new Response(null, {
        status: 204,
        headers: allowed ? writeCorsHeaders(origin) : { vary: "Origin" },
      });
    } catch {
      return new Response(null, { status: 204, headers: { vary: "Origin" } });
    }
  }

  return { POST, OPTIONS };
}

/**
 * One message per field, keyed by the path a consumer sent it under, so a form
 * can put each message beside its own input. Zod's tree carries every issue;
 * the first one is the one worth showing.
 */
function fieldMessages(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/**
 * A PostgREST result's data, or the `ApiError` its error maps to.
 *
 * Nullability is passed through rather than asserted away: `maybeSingle()`
 * answers `Row | null` and the caller decides whether a miss is a 404, and a
 * list answers `Row[] | null` where null means the read failed and the caller
 * has already thrown.
 */
export function unwrap<T>(result: {
  data: T;
  error: { message?: string } | null;
}): T {
  if (result.error) throw apiErrorFromRpc(result.error);
  return result.data;
}

/**
 * The same, for an RPC whose contract is "an id, or an exception".
 *
 * PostgREST types every result as nullable because a function *could* return
 * null. These cannot: each one ends in `returning id into ...` or raises. A
 * null here would mean the function changed under us, which is a 500 rather
 * than something to hand a caller half of.
 */
export function unwrapId(result: {
  data: string | null;
  error: { message?: string } | null;
}): string {
  const id = unwrap(result);
  if (!id) {
    console.error("[api] an intake RPC answered with no id");
    throw new ApiError("server_error", "Something went wrong on our side.");
  }
  return id;
}
