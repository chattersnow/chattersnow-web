// Integration test: exercises the real createRoleTypeAction/
// updateRoleTypeAction/listRoleTypesAction against a real local Supabase
// stack (checkUser/checkPermission, then real `volunteer_role_types` RLS).
// Per §5.3, `volunteers` is admin manage, event_coordinator/volunteer view,
// finance/board none. Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createRoleTypeAction, updateRoleTypeAction, listRoleTypesAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function roleTypeForm(overrides: { name?: string; isPublic?: boolean } = {}) {
  const fd = new FormData();
  fd.set(
    "name",
    overrides.name ?? `Integration Test Role ${crypto.randomUUID()}`,
  );
  fd.set("description", "Helps set up the basecamp tent.");
  if (overrides.isPublic) fd.set("isPublic", "on");
  return fd;
}

async function roleTypeByName(name: string) {
  const { data, error } = await adminClient
    .from("volunteer_role_types")
    .select("id, name, description, is_public")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("createRoleTypeAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual({
      error: "You must be signed in to create a role type.",
    });
  });

  test("admin role (volunteers manage) can create a role type", async () => {
    const name = `Integration Test Role ${crypto.randomUUID()}`;
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await createRoleTypeAction(
      roleTypeForm({ name, isPublic: true }),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/volunteers/roles");

    const created = await roleTypeByName(name);
    expect(created).toMatchObject({
      name,
      description: "Helps set up the basecamp tent.",
      is_public: true,
    });

    await adminClient.from("volunteer_role_types").delete().eq("name", name);
  });

  test("event_coordinator role (volunteers view only) cannot create a role type", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (volunteers view only) cannot create a role type", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual(DENIED);
  });

  test("finance role (no volunteers access) cannot create a role type", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual(DENIED);
  });

  test("board role (no volunteers access) cannot create a role type", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a role type", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    const result = await createRoleTypeAction(roleTypeForm());
    expect(result).toEqual(DENIED);
  });
});

describe("updateRoleTypeAction (integration)", () => {
  async function seedRoleType() {
    const name = `Integration Test Role ${crypto.randomUUID()}`;
    const { data, error } = await adminClient
      .from("volunteer_role_types")
      .insert({ name, description: "Original description." })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string, name };
  }

  test("admin role (volunteers manage) can update a role type", async () => {
    const roleType = await seedRoleType();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await updateRoleTypeAction(
      roleType.id,
      roleTypeForm({ name: roleType.name, isPublic: true }),
    );
    expect(result).toEqual({ success: true });

    const updated = await roleTypeByName(roleType.name);
    expect(updated).toMatchObject({
      description: "Helps set up the basecamp tent.",
      is_public: true,
    });

    await adminClient
      .from("volunteer_role_types")
      .delete()
      .eq("id", roleType.id);
  });

  test("event_coordinator role (volunteers view only) cannot update a role type", async () => {
    const roleType = await seedRoleType();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const result = await updateRoleTypeAction(
      roleType.id,
      roleTypeForm({ name: roleType.name }),
    );
    expect(result).toEqual(DENIED);

    await adminClient
      .from("volunteer_role_types")
      .delete()
      .eq("id", roleType.id);
  });
});

describe("listRoleTypesAction (integration)", () => {
  test("event_coordinator role (volunteers view) can list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const result = await listRoleTypesAction();
    expect("data" in result).toBe(true);
  });

  test("volunteer role (volunteers view) can list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await listRoleTypesAction();
    expect("data" in result).toBe(true);
  });

  test("finance role (no volunteers access) cannot list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await listRoleTypesAction();
    expect(result).toEqual(DENIED);
  });

  test("a user with no role cannot list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listRoleTypesAction();
    expect(result).toEqual(DENIED);
  });
});
