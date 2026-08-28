// Integration test: exercises the real annual requirement Server Actions
// against a real local Supabase stack (checkUser/checkPermission, then real
// `annual_requirements` RLS). Covers the status-only action too, which takes
// its own guard path and derives `completed_at` from the row already in the
// database. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
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
  createAnnualRequirementAction,
  updateAnnualRequirementAction,
  updateAnnualRequirementStatusAction,
} = await import("./annual-requirements-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `annual_requirements` has no natural unique key and the seed may hold rows
// of its own, so each test tags its row with a random name and looks that up.
function requirementForm(
  name: string,
  overrides: { status?: string; dueDate?: string } = {},
) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("dueDate", overrides.dueDate ?? "2026-05-15");
  fd.set("status", overrides.status ?? "not_started");
  fd.set("externalLink", "https://example.test/990.pdf");
  fd.set("bodyText", "Filed with the state.");
  return fd;
}

function uniqueName() {
  return `IT Requirement ${crypto.randomUUID()}`;
}

async function requirementFor(name: string) {
  const { data, error } = await adminClient
    .from("annual_requirements")
    .select(
      "id, name, due_date, status, completed_at, responsible_person_id, external_link",
    )
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedRequirement(name: string, responsiblePersonId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createAnnualRequirementAction(
    responsiblePersonId,
    requirementForm(name),
  );
  if ("error" in result) throw new Error(result.error);
  const row = await requirementFor(name);
  if (!row) throw new Error("expected a seeded annual requirement");
  return row.id as string;
}

async function cleanupRequirement(name: string) {
  await adminClient.from("annual_requirements").delete().eq("name", name);
}

describe("annual requirement actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createAnnualRequirementAction(null, requirementForm(uniqueName())),
    ).toEqual({ error: "You must be signed in to add an annual requirement." });
    expect(
      await updateAnnualRequirementAction(
        crypto.randomUUID(),
        null,
        requirementForm(uniqueName()),
      ),
    ).toEqual({
      error: "You must be signed in to update this annual requirement.",
    });
    expect(
      await updateAnnualRequirementStatusAction(crypto.randomUUID(), "done"),
    ).toEqual({
      error: "You must be signed in to update this annual requirement.",
    });
  });

  test("admin role (governance manage) can add, update and re-status a requirement", async () => {
    const name = uniqueName();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createAnnualRequirementAction(person.id, requirementForm(name)),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/annual-requirements",
    );

    const created = await requirementFor(name);
    if (!created) throw new Error("expected the created requirement");
    expect(created).toMatchObject({
      due_date: "2026-05-15",
      status: "not_started",
      completed_at: null,
      responsible_person_id: person.id,
      external_link: "https://example.test/990.pdf",
    });

    expect(
      await updateAnnualRequirementAction(
        created.id as string,
        person.id,
        requirementForm(name, { status: "in_progress" }),
      ),
    ).toEqual({ success: true });
    expect(await requirementFor(name)).toMatchObject({
      status: "in_progress",
      completed_at: null,
    });

    expect(
      await updateAnnualRequirementStatusAction(created.id as string, "done"),
    ).toEqual({ success: true });
    const done = await requirementFor(name);
    expect(done).toMatchObject({ status: "done" });
    expect(done?.completed_at).not.toBeNull();

    // Re-saving an already-done requirement keeps the original completion
    // timestamp rather than bumping it.
    expect(
      await updateAnnualRequirementAction(
        created.id as string,
        person.id,
        requirementForm(name, { status: "done" }),
      ),
    ).toEqual({ success: true });
    expect(await requirementFor(name)).toMatchObject({
      completed_at: done?.completed_at,
    });

    // Moving back off "done" clears it again.
    expect(
      await updateAnnualRequirementStatusAction(
        created.id as string,
        "in_progress",
      ),
    ).toEqual({ success: true });
    expect(await requirementFor(name)).toMatchObject({ completed_at: null });

    await cleanupRequirement(name);
    await person.cleanup();
  });

  test("board role (governance manage) can add a requirement with no responsible person", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await createAnnualRequirementAction(null, requirementForm(name)),
    ).toEqual({ success: true });
    expect(await requirementFor(name)).toMatchObject({
      responsible_person_id: null,
    });

    await cleanupRequirement(name);
  });

  test("rejects an unknown status, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const fd = requirementForm(uniqueName(), { status: "archived" });

    expect(await createAnnualRequirementAction(null, fd)).toEqual({
      error: "Invalid status.",
    });
  });

  async function expectNoAccess(email: string) {
    const name = uniqueName();
    const person = await createPerson();
    const id = await seedRequirement(name, person.id);
    currentSupabase = await signInAs(email);

    expect(
      await createAnnualRequirementAction(null, requirementForm(uniqueName())),
    ).toEqual(DENIED);
    expect(
      await updateAnnualRequirementAction(
        id,
        person.id,
        requirementForm(name, { dueDate: "2027-01-01" }),
      ),
    ).toEqual(DENIED);
    expect(await updateAnnualRequirementStatusAction(id, "done")).toEqual(
      DENIED,
    );

    // Neither denied write landed: the actions refuse them, and the
    // `annual_requirements update` policy would too.
    expect(await requirementFor(name)).toMatchObject({
      due_date: "2026-05-15",
      status: "not_started",
    });

    await cleanupRequirement(name);
    await person.cleanup();
  }

  test("event_coordinator role cannot manage annual requirements", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role cannot manage annual requirements", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role cannot manage annual requirements", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot manage annual requirements", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
