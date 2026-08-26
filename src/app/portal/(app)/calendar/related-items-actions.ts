"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type RelatedCalendarItemSummary = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string;
};

export type SuggestedRelatedCalendarItem = RelatedCalendarItemSummary & {
  shared_categories: string[];
  shared_programs: string[];
};

export type RelatedItemsActionResult = { error: string } | { success: true };

/**
 * Orders a pair of item ids consistently so the same relationship always
 * inserts as a single row regardless of which item's editor initiated the
 * link -- callers display it symmetrically (item_id = X OR related_item_id
 * = X) so neither side needs to know which is stored where.
 */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function listRelatedCalendarItemCandidatesAction(
  itemId: string,
): Promise<
  | {
      data: {
        confirmed: RelatedCalendarItemSummary[];
        suggested: SuggestedRelatedCalendarItem[];
      };
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return permissionError;

  const { data: target, error: targetError } = await supabase
    .from("calendar_items")
    .select(
      "id, item_type, starts_at, calendar_item_categories(category), calendar_item_programs(program_id)",
    )
    .eq("id", itemId)
    .single();

  if (targetError || !target) {
    return { error: "Could not load this calendar item." };
  }

  const targetCategories = (
    target.calendar_item_categories as { category: string }[]
  ).map((row) => row.category);
  const targetProgramIds = (
    target.calendar_item_programs as { program_id: string }[]
  ).map((row) => row.program_id);

  const { data: linkRows, error: linksError } = await supabase
    .from("calendar_item_links")
    .select("item_id, related_item_id")
    .or(`item_id.eq.${itemId},related_item_id.eq.${itemId}`);

  if (linksError) {
    return { error: "Could not load related items. Please try again." };
  }

  const confirmedIds = (linkRows ?? []).map((row) =>
    row.item_id === itemId ? row.related_item_id : row.item_id,
  );

  const { data: confirmedRows, error: confirmedError } =
    confirmedIds.length > 0
      ? await supabase
          .from("calendar_items")
          .select("id, title, item_type, starts_at")
          .in("id", confirmedIds)
      : { data: [] as RelatedCalendarItemSummary[], error: null };

  if (confirmedError) {
    return { error: "Could not load related items. Please try again." };
  }

  const confirmed = (confirmedRows ?? []) as RelatedCalendarItemSummary[];

  const { data: candidateRows, error: candidatesError } = await supabase
    .from("calendar_items")
    .select(
      "id, title, item_type, starts_at, calendar_item_categories(category), calendar_item_programs(program_id)",
    )
    .neq("id", itemId)
    .neq("calendar_status", "archived");

  if (candidatesError) {
    return {
      error: "Could not load related-item suggestions. Please try again.",
    };
  }

  const excludeIds = new Set([itemId, ...confirmedIds]);
  const programNames = new Map<string, string>();
  if (targetProgramIds.length > 0) {
    const { data: programRows } = await supabase
      .from("programs")
      .select("id, name")
      .in("id", targetProgramIds);
    for (const program of programRows ?? []) {
      programNames.set(program.id, program.name);
    }
  }

  const targetStartsAt = new Date(target.starts_at).getTime();

  const scored = (candidateRows ?? [])
    .filter((row) => !excludeIds.has(row.id))
    .map((row) => {
      const categories = (
        row.calendar_item_categories as { category: string }[]
      ).map((c) => c.category);
      const programIds = (
        row.calendar_item_programs as { program_id: string }[]
      ).map((p) => p.program_id);

      const sharedCategories = categories.filter((c) =>
        targetCategories.includes(c),
      );
      const sharedProgramIds = programIds.filter((id) =>
        targetProgramIds.includes(id),
      );
      const sameType = row.item_type === target.item_type;

      const score =
        sharedCategories.length * 2 +
        sharedProgramIds.length * 3 +
        (sameType ? 1 : 0);

      return {
        row,
        score,
        sharedCategories,
        sharedPrograms: sharedProgramIds.map(
          (id) => programNames.get(id) ?? id,
        ),
        dateDistance: Math.abs(
          new Date(row.starts_at).getTime() - targetStartsAt,
        ),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.dateDistance - b.dateDistance;
    })
    .slice(0, 5);

  const suggested: SuggestedRelatedCalendarItem[] = scored.map((candidate) => ({
    id: candidate.row.id,
    title: candidate.row.title,
    item_type: candidate.row.item_type,
    starts_at: candidate.row.starts_at,
    shared_categories: candidate.sharedCategories,
    shared_programs: candidate.sharedPrograms,
  }));

  return { data: { confirmed, suggested } };
}

export async function linkCalendarItemsAction(
  itemId: string,
  relatedItemId: string,
): Promise<RelatedItemsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to link calendar items.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const [a, b] = canonicalPair(itemId, relatedItemId);
  const { error } = await supabase
    .from("calendar_item_links")
    .insert({ item_id: a, related_item_id: b });

  if (error && error.code !== "23505") {
    return { error: "Could not link these items. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function unlinkCalendarItemsAction(
  itemId: string,
  relatedItemId: string,
): Promise<RelatedItemsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to unlink calendar items.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const [a, b] = canonicalPair(itemId, relatedItemId);
  const { error } = await supabase
    .from("calendar_item_links")
    .delete()
    .eq("item_id", a)
    .eq("related_item_id", b);

  if (error) {
    return { error: "Could not remove this link. Please try again." };
  }

  revalidatePath("/portal/calendar");
  return { success: true };
}
