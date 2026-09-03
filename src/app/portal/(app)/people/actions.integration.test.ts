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

const {
  createPersonAction,
  listPeopleAction,
  updatePersonAction,
  addOrganizationMembershipAction,
  removeOrganizationMembershipAction,
} = await import("./actions");

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

  test("finance role (people_intake manage carve-out) can create a person", async () => {
    // 20260829100000_create_monetary_donations.sql raised finance's
    // people_intake to manage so the Donations form's inline "new donor" path
    // works; finance previously held people:view only and was denied here.
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createPersonAction(personForm());
    expect(result).toEqual(
      expect.objectContaining({ success: true, person: expect.any(Object) }),
    );
    if ("person" in result && result.person) {
      await adminClient.from("people").delete().eq("id", result.person.id);
    }
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

  test("finance role (people_intake manage does not cover update) cannot update a person", async () => {
    // Guards the 20260829100000 grant staying insert-only: finance can create
    // an inline donor but must not gain full People-directory write access.
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.finance);
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

describe("addOrganizationMembershipAction / removeOrganizationMembershipAction (integration)", () => {
  test("admin role (people manage) can link and unlink a person and an organization", async () => {
    const org = await createPerson();
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const addResult = await addOrganizationMembershipAction(org.id, person.id);
    expect(addResult).toEqual({ success: true });

    const { data: rows } = await adminClient
      .from("person_organizations")
      .select("id")
      .eq("organization_id", org.id)
      .eq("person_id", person.id);
    expect(rows).toHaveLength(1);
    const membershipId = rows![0].id;

    const removeResult = await removeOrganizationMembershipAction(membershipId);
    expect(removeResult).toEqual({ success: true });

    const { data: rowsAfterRemove } = await adminClient
      .from("person_organizations")
      .select("id")
      .eq("id", membershipId);
    expect(rowsAfterRemove).toHaveLength(0);

    await org.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (people view only) cannot link an organization", async () => {
    const org = await createPerson();
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const result = await addOrganizationMembershipAction(org.id, person.id);
    expect(result).toEqual(DENIED);

    await org.cleanup();
    await person.cleanup();
  });
});

describe("people preferred_name and portal-account link (integration)", () => {
  test("listPeopleAction returns preferred_name and auth_user_id", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listPeopleAction();
    if ("error" in result) throw new Error(result.error);

    // seed.sql links the admin account to a people row and gives it a
    // preferred name, so this asserts real data, not just column presence.
    const linkedAdmin = result.data.find(
      (person) => person.email === SEEDED_USERS.admin,
    );
    expect(linkedAdmin?.preferred_name).toBe("Ave");
    expect(linkedAdmin?.auth_user_id).toBeTruthy();
  });

  test("a directory-only person has no auth_user_id, so no Portal user badge", async () => {
    const person = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listPeopleAction();
    if ("error" in result) throw new Error(result.error);

    const found = result.data.find((p) => p.id === person.id);
    expect(found).toBeDefined();
    expect(found?.auth_user_id ?? null).toBeNull();
  });

  test("createPersonAction round-trips a preferred name", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const form = personForm();
    form.set("preferredName", "Nick");

    const result = await createPersonAction(form);
    if (!("success" in result) || !result.person) {
      throw new Error("createPersonAction did not return a person");
    }

    try {
      expect(result.person.preferred_name).toBe("Nick");
      // A person created through the directory has no portal login.
      expect(result.person.auth_user_id ?? null).toBeNull();
    } finally {
      await adminClient.from("people").delete().eq("id", result.person.id);
    }
  });
});

describe("ensure_current_person (integration)", () => {
  test("creates a people row for a signed-in account that has none", async () => {
    // volunteer@ is deliberately left unlinked by supabase/seed.sql so this
    // provisioning path has something real to exercise.
    const supabase = await signIn(SEEDED_USERS.volunteer);

    const { data, error } = await supabase.rpc("ensure_current_person");
    expect(error).toBeNull();

    const row = (data ?? [])[0];
    expect(row?.person_id).toBeTruthy();
    expect(row?.email).toBe(SEEDED_USERS.volunteer);

    try {
      const { data: stored } = await adminClient
        .from("people")
        .select("id, auth_user_id")
        .eq("id", row.person_id)
        .single();
      expect(stored?.auth_user_id).toBeTruthy();
    } finally {
      // seed.sql deliberately leaves volunteer@ unlinked so that
      // src/lib/auth/current-person.integration.test.ts can exercise the
      // link-by-email path -- put that back.
      await adminClient.from("people").delete().eq("id", row.person_id);
    }
  });
});
