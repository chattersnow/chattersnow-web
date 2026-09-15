import { READ_CORS_HEADERS } from "@/lib/api/cors";
import { openApiDocument } from "@/lib/api/openapi";
import { readResponse } from "@/lib/api/respond";
import { getRequestOrigin } from "@/lib/request-origin";

/**
 * The contract, published rather than implied (#813 Phase 3).
 *
 * Not under `/t/{tenant}/`: the document describes the API, which is the same
 * for every organization, and a per-tenant copy would invite the idea that it
 * is not. The `servers` entry is this deployment's own origin, so a generator
 * pointed at `https://example.org/api/v1/openapi.json` produces a client that
 * talks to `example.org`.
 */
export async function GET(request: Request): Promise<Response> {
  const document = openApiDocument(await getRequestOrigin());
  return readResponse(document, request, READ_CORS_HEADERS);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: READ_CORS_HEADERS });
}
