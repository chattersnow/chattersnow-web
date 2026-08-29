import type { createAdminClient } from "./admin-client";

export type SeededPerson = { id: string; name: string };

// Governance records nearly all hang off a person (board terms, disclosure
// owners, movers, action-item owners), and several carry per-person unique
// constraints -- `board_members_one_active_per_person`, and
// `conflict_of_interest_disclosures (person_id, disclosure_year)`. Seeding a
// fresh person per test keeps the two Playwright projects that run the PR
// suite concurrently from colliding on the same shared Supabase instance.
export async function seedPerson(
  admin: ReturnType<typeof createAdminClient>,
  label: string,
): Promise<SeededPerson> {
  const name = `E2E ${label} ${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("people")
    .insert({ name, source_type: "individual" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, name };
}
