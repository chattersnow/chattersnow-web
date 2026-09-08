"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import {
  parseCalendarCategoryForm,
  slugifyCalendarCategoryKey,
} from "./category-form";

export type CalendarCategoryActionResult =
  { error: string } | { success: true };

async function requireManage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to manage calendar categories.",
  );
  if ("error" in userResult) return userResult;
  return checkPermission(supabase, "content_calendar", "manage");
}

/**
 * Every write revalidates the whole calendar section and the public community
 * calendar: the vocabulary is rendered by the filters, the pickers, every
 * item's badges and the public filter dropdown, so a rename that only refreshed
 * this page would leave the old label everywhere it actually matters.
 */
function revalidateCalendar() {
  revalidatePath("/portal/calendar", "layout");
  revalidatePath("/events/community");
}

export async function createCalendarCategoryAction(
  formData: FormData,
): Promise<CalendarCategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCalendarCategoryForm(formData);
  if ("error" in parsed) return parsed;

  // tenant_id is left to `default_tenant_id()`, so a category cannot be created
  // in someone else's tenant even if the request said so.
  const { error } = await supabase.from("calendar_categories").insert({
    ...parsed.data,
    key: slugifyCalendarCategoryKey(parsed.data.label),
  });

  if (error) {
    return {
      error: friendlyError(
        error,
        "A category with that name already exists.",
        "Could not create the category. Please try again.",
      ),
    };
  }

  revalidateCalendar();
  return { success: true };
}

export async function updateCalendarCategoryAction(
  id: string,
  formData: FormData,
): Promise<CalendarCategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const parsed = parseCalendarCategoryForm(formData);
  if ("error" in parsed) return parsed;

  // `key` is deliberately not in the update: it is what tagged items join on,
  // and re-deriving it from a new label would orphan every one of them.
  const { error } = await supabase
    .from("calendar_categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A category with that name already exists.",
        "Could not save the category. Please try again.",
      ),
    };
  }

  revalidateCalendar();
  return { success: true };
}

/**
 * Deletes a category outright. The composite foreign key on
 * `calendar_item_categories` has no `on delete cascade`, so Postgres refuses
 * while any item is still tagged -- which is the behaviour we want, and the
 * message says what to do instead. Deactivating is the non-destructive path:
 * it removes the category from every picker while the items that carry it keep
 * rendering their label.
 */
export async function deleteCalendarCategoryAction(
  id: string,
): Promise<CalendarCategoryActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await requireManage(supabase);
  if (denied) return denied;

  const { error } = await supabase
    .from("calendar_categories")
    .delete()
    .eq("id", id);

  if (error) {
    // 23503 is the composite foreign key on calendar_item_categories refusing
    // to orphan tagged items. friendlyError() only speaks 23505, and this is
    // the case worth naming: it is the one a user can act on.
    if (error.code === "23503") {
      return {
        error:
          "Calendar items still use this category. Deactivate it instead, or retag those items first.",
      };
    }
    return { error: "Could not delete the category. Please try again." };
  }

  revalidateCalendar();
  return { success: true };
}
