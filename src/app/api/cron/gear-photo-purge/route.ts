import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { runGearPhotoPurge } from "@/lib/storage/orphan-purge";
import { runArtworkPurge } from "@/lib/storage/artwork-purge";
import { runPublicationPurge } from "@/lib/storage/publication-purge";
import { runDocumentPurge } from "@/lib/storage/documents-purge";

/**
 * The daily orphan sweep over four Storage buckets, on a Vercel Cron (#781,
 * #870, #1472, #1489).
 *
 * Structurally identical to /api/cron/ops-report and /api/cron/task-reminders:
 * the same shared CRON_SECRET guard, the same counts-only response. It needs no
 * NEXT_PUBLIC_SITE_URL, since nothing is linked to or sent.
 *
 * Each job's only deletion criterion is "in the bucket, older than a day, and
 * nothing references it". Anything that stops one establishing the second half
 * of that -- an unreadable reference list, an unreadable prefix -- throws
 * rather than shaping the run, because an empty referenced-set would otherwise
 * read as "delete everything".
 *
 * The two sweeps share a route rather than taking one schedule each: Vercel's
 * Hobby plan allowed a single cron a day when this was written. Pro lifts
 * that, but one daily run is still all either sweep needs. The artwork sweep is deliberately
 * *not* inside a try that swallows -- a failure there should be as visible as
 * one in the gear sweep -- but it runs second, so a gear sweep that succeeded
 * still happened. The publication sweep (#1472) and the private documents
 * sweep (#1489) run third and fourth on the same terms.
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

  const admin = createSupabaseAdminClient();
  const gearPhotos = await runGearPhotoPurge(admin);
  const artwork = await runArtworkPurge(admin);
  const publications = await runPublicationPurge(admin);
  const documents = await runDocumentPurge(admin);
  return NextResponse.json({ gearPhotos, artwork, publications, documents });
}
