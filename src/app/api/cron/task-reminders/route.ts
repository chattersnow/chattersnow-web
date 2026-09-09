import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
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

  // The *fallback* origin since #860: each tenant's mail is linked to its own
  // custom_domain where it has one. Still required, because a run that
  // resolves no origin at all should refuse rather than put `undefined` in a
  // href for every tenant that has no domain yet.
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
