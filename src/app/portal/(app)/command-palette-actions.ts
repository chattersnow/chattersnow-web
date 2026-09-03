"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { escapeLikePattern, quoteOrValue } from "@/lib/pagination";

export type PersonHit = {
  id: string;
  label: string;
  detail: string | null;
};

export type SearchPeopleResult = { error: string } | { people: PersonHit[] };

const RESULT_LIMIT = 8;

/**
 * Cross-section person lookup for the command palette.
 *
 * People, Donors, Sponsors and Attendees are four views over the same table,
 * so an operator who knows a name but not which lens it's currently filed
 * under had to guess a section before they could search at all. This answers
 * the name without the guess; RLS and the people:view check decide what comes
 * back, exactly as on the directory pages.
 */
export async function searchPeopleAction(
  query: string,
): Promise<SearchPeopleResult> {
  const term = query.trim();
  if (term.length < 2) return { people: [] };

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "people", "view");
  if (permissionError) return permissionError;

  const pattern = quoteOrValue(`%${escapeLikePattern(term)}%`);
  const { data, error } = await supabase
    .from("people")
    .select("id, name, preferred_name, email, phone")
    .or(
      `name.ilike.${pattern},preferred_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    )
    .order("name")
    .limit(RESULT_LIMIT);

  if (error) return { error: "Could not search people. Please try again." };

  return {
    people: (data ?? []).map((person) => ({
      id: person.id as string,
      label:
        (person.preferred_name as string | null)?.trim() ||
        (person.name as string | null)?.trim() ||
        (person.email as string | null)?.trim() ||
        "Unnamed person",
      detail:
        (person.email as string | null)?.trim() ||
        (person.phone as string | null)?.trim() ||
        null,
    })),
  };
}
