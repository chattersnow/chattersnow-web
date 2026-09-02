// Integration test: exercises the real volunteer role-type Server Actions
// against a real local Supabase stack (checkUser/checkPermission, then real
// `volunteer_role_types` RLS). The catalog is gated on the `volunteers`
// resource (admin manages; event_coordinator/volunteer view; finance/board
// have none), so what this file proves is that these actions ask for that
// key at the right level -- a wrong key or a missing check here would not be
// caught anywhere else. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
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

// `volunteer_role_types.name` is unique, so every test tags its row with a
// random name and looks that up rather than reading "the most recent row".
function uniqueName() {
  return `IT Role ${crypto.randomUUID()}`;
}

function roleTypeForm(name: string, overrides: { description?: string } = {}) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("description", overrides.description ?? "Integration test role");
  return fd;
}

async function roleTypeRowFor(name: string) {
  const { data, error } = await adminClient
    .from("volunteer_role_types")
    .select("id, name, description")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedRoleType(name: string) {
  const { data, error } = await adminClient
    .from("volunteer_role_types")
    .insert({ name, description: "Integration test role" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function cleanupRoleType(name: string) {
  await adminClient.from("volunteer_role_types").delete().eq("name", name);
}

describe("volunteer role-type actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await createRoleTypeAction(roleTypeForm(uniqueName()))).toEqual({
      error: "You must be signed in to create a role type.",
    });
    expect(
      await updateRoleTypeAction(crypto.randomUUID(), roleTypeForm("Any")),
    ).toEqual({
      error: "You must be signed in to update a role type.",
    });
  });

  test("admin role (volunteers manage) can create and update a role type", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createRoleTypeAction(roleTypeForm(name))).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/volunteers/roles");

    const created = await roleTypeRowFor(name);
    if (!created) throw new Error("expected the created role type row");
    expect(created).toMatchObject({ description: "Integration test role" });

    expect(
      await updateRoleTypeAction(
        created.id as string,
        roleTypeForm(name, { description: "Updated description" }),
      ),
    ).toEqual({ success: true });
    expect(await roleTypeRowFor(name)).toMatchObject({
      description: "Updated description",
    });

    await cleanupRoleType(name);
  });

  test("duplicate names surface the friendly unique-violation message", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createRoleTypeAction(roleTypeForm(name))).toEqual({
      success: true,
    });
    expect(await createRoleTypeAction(roleTypeForm(name))).toEqual({
      error: "A role type with this name already exists.",
    });

    await cleanupRoleType(name);
  });

  async function expectNoWriteAccess(email: string) {
    const name = uniqueName();
    const id = await seedRoleType(name);
    currentSupabase = await signInAs(email);

    expect(await createRoleTypeAction(roleTypeForm(uniqueName()))).toEqual(
      DENIED,
    );
    expect(
      await updateRoleTypeAction(
        id,
        roleTypeForm(name, { description: "Rewritten by unauthorized role" }),
      ),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `volunteer_role_types update` policy would too.
    expect(await roleTypeRowFor(name)).toMatchObject({
      description: "Integration test role",
    });

    await cleanupRoleType(name);
  }

  test("event_coordinator role (volunteers view) cannot create or update role types", async () => {
    await expectNoWriteAccess(SEEDED_USERS.coordinator);
  });

  test("volunteer role (volunteers view) cannot create or update role types", async () => {
    await expectNoWriteAccess(SEEDED_USERS.volunteer);
  });

  test("finance role (no volunteers access) cannot create or update role types", async () => {
    await expectNoWriteAccess(SEEDED_USERS.finance);
  });

  test("a deactivated (former) account cannot create or update role types", async () => {
    await expectNoWriteAccess(SEEDED_USERS.former);
  });

  test("volunteer role (volunteers view) can list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await listRoleTypesAction();
    expect("data" in result).toBe(true);
  });

  test("finance role (no volunteers access) cannot list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await listRoleTypesAction()).toEqual(DENIED);
  });

  test("a user with no role cannot list role types", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    expect(await listRoleTypesAction()).toEqual(DENIED);
  });
});
