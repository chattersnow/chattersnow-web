"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  parseCalendarImportRow,
  type CalendarImportRow,
} from "./calendar-import-row";

export type BulkImportResult =
  { error: string } | { success: true; insertedCount: number };

/**
 * Bulk-imports new one-off external observances (distinct from the
 * recurring-series "generate next year" path in ../recurrence-actions.ts).
 * Every row is force-set to idea/internal/undecided regardless of what the
 * caller passed, and never gets a series_key -- these are one-off items,
 * not recurring, by design (issue #191 scope 3: bulk import is for new
 * observances, not a substitute for the recurrence engine).
 */
export async function bulkImportCalendarItemsAction(
  source: string,
  rows: CalendarImportRow[],
): Promise<BulkImportResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to import calendar items.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const trimmedSource = source.trim();
  if (!trimmedSource)
    return { error: "A source is required for the import batch." };
  if (rows.length === 0) return { error: "No rows to import." };

  // Never trust client-only validation -- re-validate every row against the
  // same rules the preview step used before it's allowed to reach the DB.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const revalidated = parseCalendarImportRow(
      {
        title: row.title,
        item_type: row.itemType,
        starts_at: row.startsAt,
        ends_at: row.endsAt ?? undefined,
        time_zone: row.timeZone,
        recurrence_rule: row.recurrenceRule ?? undefined,
        priority_tier: String(row.priorityTier),
        category: row.category,
        region: row.region ?? undefined,
      },
      i + 1,
    );
    if ("error" in revalidated) return { error: revalidated.error };
  }

  const { data: inserted, error } = await supabase
    .from("calendar_items")
    .insert(
      rows.map((row) => ({
        title: row.title,
        item_type: row.itemType,
        starts_at: row.startsAt,
        ends_at: row.endsAt,
        time_zone: row.timeZone,
        recurrence_rule: row.recurrenceRule,
        priority_tier: row.priorityTier,
        calendar_status: "idea",
        visibility: "internal",
        decision: null,
        source: trimmedSource,
        region: row.region,
      })),
    )
    .select("id");

  if (error || !inserted) {
    return { error: "Could not import calendar items. Please try again." };
  }

  const { error: categoryError } = await supabase
    .from("calendar_item_categories")
    .insert(
      inserted.map((row, i) => ({
        item_id: row.id,
        category: rows[i].category,
      })),
    );
  if (categoryError) {
    return {
      error: "Items were imported but their categories could not be saved.",
    };
  }

  revalidatePath("/portal/calendar");
  return { success: true, insertedCount: inserted.length };
}
