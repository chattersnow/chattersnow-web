import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The public read behind the Programs page's module mode (#898).
 *
 * Kept out of `page.tsx` the way `events/event-detail-data.ts` is: the page is
 * markup and one branch, and the shape a tenant's own program rows arrive in
 * is a thing to read on its own.
 */
export type PublicProgram = {
  pillar: string | null;
  emoji: string | null;
  name: string;
  description: string | null;
};

/**
 * The tenant's published programs, ordered the way the page lists them.
 *
 * `public_programs` is a definer view over `programs`, which admits
 * `authenticated` only; it filters to `is_public` rows of the tenant the
 * request host resolved to. A failed read returns nothing rather than throwing
 * -- the page then renders its empty copy, which is the same thing a tenant
 * that has published no programs sees.
 */
export async function listPublicPrograms(
  supabase: SupabaseClient,
): Promise<PublicProgram[]> {
  const { data, error } = await supabase
    .from("public_programs")
    .select("name, description, pillar, emoji, sort_order")
    // Nulls last, so a program nobody ordered sits after the ones somebody
    // did rather than leading the list.
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    console.error(
      "[programs] could not read public_programs; the page is falling back to its empty state",
      error,
    );
    return [];
  }

  return (data ?? []) as PublicProgram[];
}
