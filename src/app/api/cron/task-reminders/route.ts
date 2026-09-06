import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runTaskDigest } from "@/lib/notifications/task-digest-job";

/**
 * The daily task digest, on a Vercel Cron (#488).
 *
 * No `runtime` or `dynamic` export: in this version of Next, `nodejs` is the
 * default runtime (Edge is deprecated and the docs say to drop the export) and
 * Route Handlers are not cached unless a GET opts in.
 *
 * The schedule is in vercel.json. Until #585 splits the website and the portal
 * into two Vercel projects they share this file, so the job may fire twice --
 * which is exactly what the delivery ledger's unique constraint is for: the
 * second run claims nothing and sends nothing.
 */

/**
 * Constant-time bearer check, exported so the interesting part is a unit test
 * rather than an HTTP one -- the same split as `resolveDestination` in
 * src/app/auth/callback/route.ts.
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

export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    // No detail, deliberately: "no secret configured" and "wrong secret" are
    // the same answer to anyone outside.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SITE_URL is not configured." },
      { status: 500 },
    );
  }

  const summary = await runTaskDigest(createSupabaseAdminClient(), { siteUrl });
  // Counts only. This lands in a Vercel log, which is not a place for names or
  // addresses.
  return NextResponse.json(summary);
}
