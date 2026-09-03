import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolves the browser-tab title for a detail route.
 *
 * Every detail route -- event, person, meeting, donation, calendar item,
 * asset -- fell back to the bare "Chatter Snow Portal" default, which is
 * exactly where a tab title carries the most information: ops work is
 * multi-tab work, and a row of tabs all reading the same thing is unusable.
 *
 * A deliberately narrow query rather than reusing the page's own: it selects
 * one column, runs under the same RLS, and is React-cached so a repeat within
 * the request is free. It never throws -- a title is not worth failing a page
 * render over, and the page's own notFound() still governs whether the route
 * exists at all.
 */
export const detailTitle = cache(async function detailTitle({
  table,
  column,
  id,
  fallback,
}: {
  table: string;
  /** Column holding the record's display name. */
  column: string;
  id: string;
  /** Used when the record is missing, unreadable, or has no name. */
  fallback: string;
}): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from(table)
      .select(column)
      .eq("id", id)
      .maybeSingle();
    const value = (data as Record<string, unknown> | null)?.[column];
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
});
