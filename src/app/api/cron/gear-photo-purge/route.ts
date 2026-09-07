import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { runGearPhotoPurge } from "@/lib/storage/orphan-purge";

/**
 * The daily gear-photo orphan sweep, on a Vercel Cron (#781).
 *
 * Structurally identical to /api/cron/ops-report and /api/cron/task-reminders:
 * the same shared CRON_SECRET guard, the same counts-only response. It needs no
 * NEXT_PUBLIC_SITE_URL, since nothing is linked to or sent.
 *
 * The job's only deletion criterion is "in the bucket, older than a day, and no
 * inventory_items row references it". Anything that stops it establishing the
 * second half of that -- an unreadable item list, an unreadable prefix -- throws
 * rather than shaping the run, because an empty referenced-set would otherwise
 * read as "delete everything".
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

  const summary = await runGearPhotoPurge(createSupabaseAdminClient());
  return NextResponse.json(summary);
}
