"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { formatDateInZone } from "@/lib/time";
import { syncCalendarItemLinks, type CalendarActionResult } from "./actions";
import {
  computeNextInstanceWindow,
  findMissingCoverageSeries,
} from "./calendar-recurrence";
import {
  getMissingCoverageSeriesForYear,
  listSeriesCandidates,
  type SeriesCandidateItem,
} from "./queries";

const SINGLE_ITEM_SELECT =
  "id, title, item_type, starts_at, time_zone, summary, priority_tier, priority_rationale, calendar_status, recurrence_rule, source, region, is_sensitive_topic, tone_guidance, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, calendar_item_categories(category), calendar_item_programs(program_id)";

/**
 * Inserts the next year's draft instance of a recurring series, copying
 * everything a human would otherwise retype by hand. Always lands as
 * idea/internal/undecided regardless of the source item's own status --
 * this is a fresh year's candidate, not a republish of last year's
 * decision. The sensitive-topic flag/guidance carries forward (the topic's
 * sensitivity doesn't change year to year) but the sign-off itself resets,
 * since it's tied to a specific instance's content, not the series.
 */
async function insertNextInstanceForSeries(
  supabase: SupabaseClient,
  sourceItem: SeriesCandidateItem,
  targetYear: number,
): Promise<CalendarActionResult & { insertedId?: string }> {
  const { startsAt, endsAt } = computeNextInstanceWindow(
    sourceItem,
    targetYear,
  );

  const { data: inserted, error } = await supabase
    .from("calendar_items")
    .insert({
      title: sourceItem.title,
      item_type: sourceItem.item_type,
      starts_at: startsAt,
      ends_at: endsAt,
      time_zone: sourceItem.time_zone,
      recurrence_rule: sourceItem.recurrence_rule,
      summary: sourceItem.summary,
      priority_tier: sourceItem.priority_tier,
      priority_rationale: sourceItem.priority_rationale,
      calendar_status: "idea",
      visibility: "internal",
      owner_id: null,
      decision: null,
      decision_note: null,
      source: sourceItem.source,
      region: sourceItem.region,
      exceptions: [],
      is_sensitive_topic: sourceItem.is_sensitive_topic,
      tone_guidance: sourceItem.tone_guidance,
      sensitive_review_by: null,
      sensitive_review_at: null,
      series_key: sourceItem.series_key,
      recurrence_start_month: sourceItem.recurrence_start_month,
      recurrence_start_day: sourceItem.recurrence_start_day,
      recurrence_end_month: sourceItem.recurrence_end_month,
      recurrence_end_day: sourceItem.recurrence_end_day,
      recurrence_end_is_month_end: sourceItem.recurrence_end_is_month_end,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      error: `Could not generate ${sourceItem.title} for ${targetYear}.`,
    };
  }

  const linkError = await syncCalendarItemLinks(
    supabase,
    inserted.id,
    sourceItem.categories,
    sourceItem.program_ids,
  );
  if (linkError) return linkError;

  return { success: true, insertedId: inserted.id };
}

export async function generateNextYearInstanceAction(
  itemId: string,
): Promise<CalendarActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to generate a calendar item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: item, error: fetchError } = await supabase
    .from("calendar_items")
    .select(SINGLE_ITEM_SELECT)
    .eq("id", itemId)
    .single();
  if (fetchError || !item) {
    return { error: "Could not find the calendar item to generate from." };
  }

  const raw = item as unknown as Omit<
    SeriesCandidateItem,
    "categories" | "program_ids"
  > & {
    calendar_item_categories: { category: string }[] | null;
    calendar_item_programs: { program_id: string }[] | null;
  };
  if (!raw.series_key) {
    return { error: "This item isn't part of a recurring series." };
  }

  const sourceItem: SeriesCandidateItem = {
    ...raw,
    categories: (raw.calendar_item_categories ?? []).map((c) => c.category),
    program_ids: (raw.calendar_item_programs ?? []).map((p) => p.program_id),
  };

  const targetYear =
    Number(
      formatDateInZone(
        new Date(sourceItem.starts_at),
        sourceItem.time_zone,
      ).slice(0, 4),
    ) + 1;

  // Defensive re-check: don't trust the UI to know whether targetYear is
  // already covered, in case another admin generated it in the meantime.
  const candidates = await listSeriesCandidates(supabase);
  const stillMissing = findMissingCoverageSeries(
    candidates.filter((c) => c.series_key === sourceItem.series_key),
    targetYear,
  );
  if (stillMissing.length === 0) {
    return { error: `An instance for ${targetYear} already exists.` };
  }

  const result = await insertNextInstanceForSeries(
    supabase,
    sourceItem,
    targetYear,
  );
  if ("error" in result) return result;

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function generateMissingCalendarSeriesInstancesAction(
  targetYear: number,
): Promise<CalendarActionResult & { generatedCount?: number }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to generate calendar items.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  // Re-queries "still missing" right here rather than trusting a
  // client-passed list -- this is what makes running this action twice in a
  // row a no-op the second time, with no DB-level uniqueness constraint
  // needed to prevent double-inserting.
  const missing = await getMissingCoverageSeriesForYear(supabase, targetYear);

  let generatedCount = 0;
  for (const { sourceItem } of missing) {
    const result = await insertNextInstanceForSeries(
      supabase,
      sourceItem,
      targetYear,
    );
    if ("error" in result) return result;
    generatedCount += 1;
  }

  revalidatePath("/portal/calendar");
  revalidatePath("/portal/calendar/import");
  return { success: true, generatedCount };
}
