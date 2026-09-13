import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMember } from "./team-members";

/**
 * The public read behind Meet the Team's People mode (#1014).
 *
 * Kept out of `page.tsx` the way `programs/programs-data.ts` is: the page is
 * markup and one branch, and the shape a tenant's own people rows arrive in is
 * a thing to read on its own.
 */
type PublicTeamRow = {
  name: string;
  role: string | null;
  photo_url: string | null;
  bio: string | null;
  sort_order: number | null;
};

/**
 * A stored biography is one text column; the page renders paragraphs, as the
 * copy rows store them. A blank line is a paragraph break, the way the portal
 * form says it is, and stray whitespace-only lines do not become empty
 * paragraphs.
 */
export function bioParagraphs(bio: string | null | undefined): string[] {
  if (!bio) return [];
  return bio
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * The people the tenant has put on its team page, in the order it listed
 * them, already in the shape the arrangements render.
 *
 * `public_team` is a definer view over `public_team_members` and `people`,
 * which admit `authenticated` only; it filters to the tenant the request host
 * resolved to. A failed read returns nothing rather than throwing -- the page
 * then renders its empty copy, which is the same thing a tenant that has
 * listed nobody sees.
 *
 * No `photo_slot`: a person without a photo falls through `resolvePhoto` to
 * the tenant's `about_team_photo` slot, exactly as a copy row without one does.
 */
export async function listPublicTeam(
  supabase: SupabaseClient,
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("public_team")
    .select("name, role, photo_url, bio, sort_order")
    // Nulls last, so a person nobody ordered sits after the ones somebody did
    // rather than leading the page.
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    console.error(
      "[about/team] could not read public_team; the page is falling back to its empty state",
      error,
    );
    return [];
  }

  return ((data ?? []) as PublicTeamRow[]).map((row) => ({
    name: row.name,
    role: row.role ?? undefined,
    photo_url: row.photo_url ?? undefined,
    bio: bioParagraphs(row.bio),
  }));
}
