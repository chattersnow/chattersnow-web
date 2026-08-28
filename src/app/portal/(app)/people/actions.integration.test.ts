// Integration test: exercises the real createPersonAction/listPeopleAction/
// updatePersonAction against a real local Supabase stack (checkAnyPermission,
// then real `people` RLS). The `people` table holds donor/sponsor/volunteer
// contact PII and, until now, had no role-based automated coverage -- every
// other integration test file that touches `people` only uses it as an FK
// fixture. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signIn,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createPersonAction, listPeopleAction, updatePersonAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function personForm(overrides?: { name?: string }) {
  const fd = new FormData();
  fd.set(
    "name",
    overrides?.name ?? `Integration Test Contact ${crypto.randomUUID()}`,
  );
  fd.set("isDonor", "on");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("createPersonAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createPersonAction(personForm());
    expect(result).toEqual({
      error: "You must be signed in to add a person.",
    });
  });

  test("admin role (people manage) can create a person", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(
      expect.objectContaining({ success: true, person: expect.any(Object) }),
    );
    if ("person" in result && result.person) {
      await adminClient.from("people").delete().eq("id", result.person.id);
    }
  });

  test("volunteer role (people_intake manage carve-out, no people access) can create a person", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(
      expect.objectContaining({ success: true, person: expect.any(Object) }),
    );
    if ("person" in result && result.person) {
      await adminClient.from("people").delete().eq("id", result.person.id);
    }
  });

  test("finance role (people view only) cannot create a person", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(DENIED);
  });

  test("board role (no people access) cannot create a person", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a person", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(DENIED);
  });
});

describe("listPeopleAction (integration)", () => {
  test("finance role (people view) can list people", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listPeopleAction();
    expect("data" in result).toBe(true);
  });

  test("board role can list people via the governance-manage carve-out", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await listPeopleAction();
    expect("data" in result).toBe(true);
  });

  test("a user with no role cannot list people", async () => {
    currentSupabase = await signIn(SEEDED_USERS.noAccess);
    const result = await listPeopleAction();
    expect(result).toEqual(DENIED);
  });
});

describe("updatePersonAction (integration)", () => {
  test("admin role (people manage) can update a person", async () => {
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await updatePersonAction(
      person.id,
      personForm({ name: "Updated Name" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("people")
      .select("name")
      .eq("id", person.id)
      .single();
    expect(data?.name).toBe("Updated Name");
    await person.cleanup();
  });

  test("volunteer role (people_intake manage does not cover update) cannot update a person", async () => {
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await updatePersonAction(person.id, personForm());
    expect(result).toEqual(DENIED);
    await person.cleanup();
  });

  test("event_coordinator role (people view only) cannot update a person", async () => {
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await updatePersonAction(person.id, personForm());
    expect(result).toEqual(DENIED);
    await person.cleanup();
  });
});
