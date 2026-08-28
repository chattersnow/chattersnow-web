// Integration test: exercises the real custom-role Server Actions
// (checkPermission, then the real `roles`/`role_permissions`/`user_roles`
// RLS and the seeded-role protections in seeded-roles.ts) against a real
// local Supabase stack. No integration test previously touched the `roles`
// table itself. Requires `bun run db:start && bun run db:reset` first; run
// via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only" -- stub it so this plain `bun test` run can
// create a throwaway auth.users row for the "role still assigned" case
// (user_roles.user_id hard-FKs to auth.users).
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const { createRoleAction, renameRoleAction, deleteRoleAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

async function createThrowawayUser() {
  const email = uniqueEmail("role-user");
  const { data, error } = await serviceRoleClient.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const id = data.user.id;
  return {
    id,
    async cleanup() {
      await serviceRoleClient.auth.admin.deleteUser(id);
    },
  };
}

async function roleByName(name: string) {
  const { data, error } = await adminClient
    .from("roles")
    .select("id, name, description")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createCustomRole(
  name = `Integration Role ${crypto.randomUUID()}`,
) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createRoleAction(
    name,
    "Created for an integration test",
  );
  if ("error" in result) throw new Error(result.error);
  const role = await roleByName(name);
  if (!role) throw new Error("expected the created role");
  return {
    id: role.id as string,
    name,
    async cleanup() {
      await adminClient.from("roles").delete().eq("id", role.id);
    },
  };
}

describe("administration/roles actions (integration)", () => {
  test("validates the role name before checking permission", async () => {
    currentSupabase = anonClient();
    const seeded = await roleByName("volunteer");
    if (!seeded) throw new Error("expected the seeded volunteer role");

    expect(await createRoleAction("", "")).toEqual({
      error: "Role name is required.",
    });
    expect(await renameRoleAction(seeded.id as string, "  ", "")).toEqual({
      error: "Role name is required.",
    });
  });

  test("requires administration:manage to create, rename or delete a role", async () => {
    currentSupabase = anonClient();
    const seeded = await roleByName("volunteer");
    if (!seeded) throw new Error("expected the seeded volunteer role");

    expect(
      await createRoleAction(`Anon Role ${crypto.randomUUID()}`, ""),
    ).toEqual(DENIED);
    expect(
      await renameRoleAction(seeded.id as string, "Renamed Volunteer", ""),
    ).toEqual(DENIED);
    expect(await deleteRoleAction(seeded.id as string)).toEqual(DENIED);
  });

  test("admin can create, rename and delete an unused custom role", async () => {
    const role = await createCustomRole();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/roles",
    );
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await renameRoleAction(role.id, `${role.name} Renamed`, "Updated"),
    ).toEqual({ success: true });
    const renamed = await roleByName(`${role.name} Renamed`);
    expect(renamed).toMatchObject({ description: "Updated" });

    expect(await deleteRoleAction(role.id)).toEqual({ success: true });
    expect(await roleByName(`${role.name} Renamed`)).toBeNull();
  });

  test("createRoleAction rejects a duplicate name", async () => {
    const role = await createCustomRole();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createRoleAction(role.name, "")).toEqual({
      error: "A role with that name already exists.",
    });

    await role.cleanup();
  });

  test("renameRoleAction and deleteRoleAction reject an unknown role id", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const missingId = crypto.randomUUID();

    expect(await renameRoleAction(missingId, "New Name", "")).toEqual({
      error: "Role not found.",
    });
    expect(await deleteRoleAction(missingId)).toEqual({
      error: "Role not found.",
    });
  });

  test("built-in roles can't be renamed or deleted", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const seeded = await roleByName("volunteer");
    if (!seeded) throw new Error("expected the seeded volunteer role");

    expect(
      await renameRoleAction(seeded.id as string, "Not Volunteer", ""),
    ).toEqual({ error: "Built-in roles can't be renamed." });
    expect(await deleteRoleAction(seeded.id as string)).toEqual({
      error: "Built-in roles can't be deleted.",
    });

    // Neither denial mutated the seeded role.
    expect(await roleByName("volunteer")).toMatchObject({
      id: seeded.id,
      name: "volunteer",
    });
  });

  test("a role still assigned to a user can't be deleted", async () => {
    const role = await createCustomRole();
    const user = await createThrowawayUser();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const { error: assignError } = await adminClient
      .from("user_roles")
      .insert({ user_id: user.id, role_id: role.id });
    if (assignError) throw assignError;

    expect(await deleteRoleAction(role.id)).toEqual({
      error: "This role is still assigned to 1 user and can't be deleted.",
    });

    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", user.id)
      .eq("role_id", role.id);
    expect(await deleteRoleAction(role.id)).toEqual({ success: true });

    await user.cleanup();
  });

  // The seven accounts with no administration access at all.
  const ROLES_WITHOUT_ADMINISTRATION = [
    ["event_coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["board", SEEDED_USERS.board],
    ["volunteer", SEEDED_USERS.volunteer],
    ["multi-role (event_coordinator + volunteer)", SEEDED_USERS.multi],
    ["no-role", SEEDED_USERS.noAccess],
    ["deactivated (former)", SEEDED_USERS.former],
  ] as const;

  for (const [label, email] of ROLES_WITHOUT_ADMINISTRATION) {
    test(`${label} account cannot create, rename or delete a role`, async () => {
      const role = await createCustomRole();
      currentSupabase = await signInAs(email);

      expect(
        await createRoleAction(`Denied Role ${crypto.randomUUID()}`, ""),
      ).toEqual(DENIED);
      expect(await renameRoleAction(role.id, "Denied Rename", "")).toEqual(
        DENIED,
      );
      expect(await deleteRoleAction(role.id)).toEqual(DENIED);

      // The denied rename/delete didn't land.
      expect(await roleByName(role.name)).toMatchObject({ id: role.id });

      await role.cleanup();
    });
  }
});
