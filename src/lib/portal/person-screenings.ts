import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One volunteer screening outcome, as every surface that shows one reads it
 * (#1360).
 *
 * Four fields and no fifth. That is the whole record: which level, when it was
 * decided, and when the clearance runs to. There is no note, no reference and
 * no result, because `person_screenings` has no column for one -- see the
 * migration's comment for why that is a schema guarantee rather than a
 * validation one.
 */
export type PersonScreeningRow = {
  id: string;
  cleared_on: string;
  expires_on: string | null;
  tier: { id: string; name: string } | null;
};

export const NO_PERSON_SCREENINGS: {
  byPerson: Record<string, PersonScreeningRow[]>;
} = { byPerson: {} };

const SELECT =
  "id, person_id, cleared_on, expires_on, tier:volunteer_screening_tiers(id, name)";

/**
 * Every outcome recorded against a page of people, in one query.
 *
 * Plural by design, for the reason `loadRecordMessages` is: the volunteer
 * application list renders a sheet per row, and a per-sheet read would be a
 * round trip per row for a panel most of them never open.
 *
 * Row-level security is the floor here, not this function. A caller without
 * `volunteer_screening:view` gets an empty map because the select policy
 * returns nothing, so skipping the call when the permission is absent saves a
 * round trip and is not what makes it safe.
 */
export async function loadPersonScreenings(
  supabase: SupabaseClient,
  personIds: string[],
): Promise<{ byPerson: Record<string, PersonScreeningRow[]> }> {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return { byPerson: {} };

  const { data } = await supabase
    .from("person_screenings")
    .select(SELECT)
    .in("person_id", ids)
    .order("cleared_on", { ascending: false });

  const byPerson: Record<string, PersonScreeningRow[]> = {};
  for (const row of (data ?? []) as unknown as (PersonScreeningRow & {
    person_id: string;
  })[]) {
    (byPerson[row.person_id] ??= []).push({
      id: row.id,
      cleared_on: row.cleared_on,
      expires_on: row.expires_on,
      tier: row.tier,
    });
  }
  return { byPerson };
}

/**
 * Whether a clearance has run out, against the tenant's own day rather than
 * the viewer's or the server's.
 *
 * Both values are ISO calendar days ("2026-03-14"), which compare correctly as
 * strings -- so no Date is constructed and nothing can be shifted a day by a
 * time zone.
 */
export function isExpired(
  screening: Pick<PersonScreeningRow, "expires_on">,
  today: string,
): boolean {
  return screening.expires_on !== null && screening.expires_on < today;
}
