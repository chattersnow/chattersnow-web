import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { runEventReminders } from "@/lib/notifications/event-reminders";
import { reminderDailyLimit } from "@/lib/event-reminders";

/**
 * The event reminder, on an hourly Vercel Cron (#1652), so "N days before at
 * 09:00 in the event's zone" lands within the hour wherever the event is.
 * task-reminders' doorman: the same bearer check, the same refusal without a
 * site URL, counts only in the response.
 *
 * Each run sends at most what is left of `EVENT_REMINDER_DAILY_LIMIT` (default
 * 100, the Resend free tier's daily cap) after the last 24 hours' reminders;
 * the rest go in a later run.
 */

// 100 sends spaced like an announcement's take about a minute.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SITE_URL is not configured." },
      { status: 500 },
    );
  }

  const summary = await runEventReminders(createSupabaseAdminClient(), {
    siteUrl,
    dailyLimit: reminderDailyLimit(process.env.EVENT_REMINDER_DAILY_LIMIT),
  });
  return NextResponse.json(summary);
}
