import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { runOpsReport } from "@/lib/notifications/ops-report-job";

/**
 * The daily leadership ops report, on a Vercel Cron (#743).
 *
 * Structurally identical to /api/cron/task-reminders: same CRON_SECRET guard
 * (shared, not copied -- see @/lib/notifications/cron-auth), same
 * counts-only response, same reliance on the delivery ledger rather than on
 * the scheduler firing exactly once. The schedule is in vercel.json.
 *
 * A second route rather than a second call inside the first, because the two
 * jobs answer to different settings and either should be able to fail, be
 * retried or be rescheduled without touching the other.
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

  const summary = await runOpsReport(createSupabaseAdminClient(), { siteUrl });
  // Counts only. This lands in a Vercel log, which is not a place for the
  // organization's numbers or the leadership inbox's address.
  return NextResponse.json(summary);
}
