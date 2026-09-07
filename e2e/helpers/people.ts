import type { Locator, Page } from "@playwright/test";
import type { createAdminClient } from "./admin-client";

type AdminClient = ReturnType<typeof createAdminClient>;

export type SeededPerson = { id: string; name: string };

/**
 * Governance records nearly all hang off a person (board terms, disclosure
 * owners, movers, action-item owners), and several carry per-person unique
 * constraints -- `board_members_one_active_per_person`, and
 * `conflict_of_interest_disclosures (person_id, disclosure_year)`. Seeding a
 * fresh person per test keeps the two Playwright projects that run the PR
 * suite concurrently against one Supabase instance from colliding.
 */
export async function seedPerson(
  admin: AdminClient,
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

/**
 * Drives a PersonPicker: type into its combobox, then pick the match.
 *
 * Worth a helper because the picker's results are markup that has already
 * changed once -- they were plain <button>s until #567 rebuilt the picker as a
 * real combobox -- and nine specs were pinned to the old role.
 */
export async function pickPerson(
  scope: Locator | Page,
  name: string | RegExp,
  opts?: { placeholder?: string },
) {
  const placeholder = opts?.placeholder ?? "Search by name or email...";
  await scope
    .getByPlaceholder(placeholder)
    .first()
    .fill(typeof name === "string" ? name : name.source);
  await scope.getByRole("option", { name }).first().click();
}
