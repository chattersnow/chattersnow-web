// Integration test: exercises the real conflict-of-interest disclosure Server
// Actions against a real local Supabase stack (checkUser/checkPermission,
// then real `conflict_of_interest_disclosures` RLS). Disclosures name
// individual people, so a wrong resource key or a missing check here would
// leak personal records to roles the entitlement matrix gives no governance
// access at all. Requires `bun run db:start && bun run db:reset` first; run
// via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listDisclosuresAction,
  createDisclosureAction,
  updateDisclosureAction,
  deleteDisclosureAction,
} = await import("./disclosures-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function disclosureForm(
  overrides: { year?: string; notes?: string; onFileDate?: string } = {},
) {
  const fd = new FormData();
  fd.set("disclosureYear", overrides.year ?? "2026");
  fd.set("onFileDate", overrides.onFileDate ?? "2026-01-15");
  fd.set("notes", overrides.notes ?? "No conflicts reported");
  fd.set("bodyText", "Signed form on file.");
  return fd;
}

async function disclosureFor(personId: string) {
  const { data, error } = await adminClient
    .from("conflict_of_interest_disclosures")
    .select("id, person_id, disclosure_year, on_file_date, notes, body_text")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Seeds one disclosure via the real action (as admin) so denied-role cases
// have an existing row to attempt an update/delete against.
async function seedDisclosure(personId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createDisclosureAction(personId, disclosureForm());
  if ("error" in result) throw new Error(result.error);
  const row = await disclosureFor(personId);
  if (!row) throw new Error("expected a seeded disclosure");
  return row.id as string;
}

describe("conflict of interest disclosure actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createDisclosureAction(crypto.randomUUID(), disclosureForm()),
    ).toEqual({ error: "You must be signed in to add a disclosure." });
    expect(
      await updateDisclosureAction(
        crypto.randomUUID(),
        crypto.randomUUID(),
        disclosureForm(),
      ),
    ).toEqual({ error: "You must be signed in to update this disclosure." });
    expect(await deleteDisclosureAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove this disclosure.",
    });
    // listDisclosuresAction has no checkUser guard -- an anonymous client
    // holds no permissions, so it falls through to the permission check.
    expect(await listDisclosuresAction()).toEqual(DENIED);
  });

  test("admin role (governance manage) can add, list, update and remove a disclosure", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createDisclosureAction(person.id, disclosureForm())).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/conflict-of-interest",
    );

    const created = await disclosureFor(person.id);
    if (!created) throw new Error("expected the created disclosure");
    expect(created).toMatchObject({
      disclosure_year: 2026,
      on_file_date: "2026-01-15",
      notes: "No conflicts reported",
      body_text: "Signed form on file.",
    });

    const listed = await listDisclosuresAction();
    if (!("data" in listed)) throw new Error("expected data");
    expect(
      listed.data.some((disclosure) => disclosure.person.id === person.id),
    ).toBe(true);

    expect(
      await updateDisclosureAction(
        created.id as string,
        person.id,
        disclosureForm({ notes: "Board seat at a partner nonprofit" }),
      ),
    ).toEqual({ success: true });
    expect(await disclosureFor(person.id)).toMatchObject({
      notes: "Board seat at a partner nonprofit",
    });

    expect(await deleteDisclosureAction(created.id as string)).toEqual({
      success: true,
    });
    expect(await disclosureFor(person.id)).toBeNull();

    await person.cleanup();
  });

  test("board role (governance manage) can add a disclosure", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createDisclosureAction(person.id, disclosureForm())).toEqual({
      success: true,
    });

    await adminClient
      .from("conflict_of_interest_disclosures")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  });

  test("a person cannot have two disclosures for the same year", async () => {
    const person = await createPerson();
    await seedDisclosure(person.id);

    expect(await createDisclosureAction(person.id, disclosureForm())).toEqual({
      error:
        "This person already has a disclosure recorded for this year. Edit their existing entry instead.",
    });

    await adminClient
      .from("conflict_of_interest_disclosures")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  });

  test("requires a person, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(await createDisclosureAction("", disclosureForm())).toEqual({
      error: "Select or create a person for this disclosure.",
    });
  });

  async function expectNoAccess(email: string) {
    const person = await createPerson();
    const disclosureId = await seedDisclosure(person.id);
    currentSupabase = await signInAs(email);

    expect(await listDisclosuresAction()).toEqual(DENIED);
    expect(
      await createDisclosureAction(person.id, disclosureForm({ year: "2025" })),
    ).toEqual(DENIED);
    expect(
      await updateDisclosureAction(
        disclosureId,
        person.id,
        disclosureForm({ notes: "Rewritten by an unauthorized role" }),
      ),
    ).toEqual(DENIED);
    expect(await deleteDisclosureAction(disclosureId)).toEqual(DENIED);

    // Neither the denied update nor the denied delete landed: the action
    // refuses both, and the table's RLS policies would too.
    expect(await disclosureFor(person.id)).toMatchObject({
      notes: "No conflicts reported",
    });

    await adminClient
      .from("conflict_of_interest_disclosures")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  }

  test("event_coordinator role has no access to disclosures", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role has no access to disclosures", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role has no access to disclosures", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account has no access to disclosures", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
