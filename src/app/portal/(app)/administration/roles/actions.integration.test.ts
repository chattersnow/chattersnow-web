// Integration test: exercises the real custom-role Server Actions
// (checkPermission, then the real `roles`/`role_permissions`/`user_roles`
// RLS and the guards in protected-roles.ts) against a real local Supabase
// stack. No integration test previously touched the `roles` table itself.
//
// Since #946 that includes updateRolePermissionsAction, which arrived here
// with the Permissions page it used to serve -- its own file was
// administration/permissions/actions.integration.test.ts. Distinct from
// permission-matrix.integration.test.ts, which only exercises
// has_permission()/my_permissions() reading the seeded matrix, never a write
// path.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
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

const {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  updateRolePermissionsAction,
} = await import("./actions");

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
    .select("id, tenant_id, name, label, description")
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

describe("administration/roles actions (integration)", () => {
  test("validates the role name before checking permission", async () => {
    currentSupabase = anonClient();
    const seeded = await roleByName("volunteer");
    if (!seeded) throw new Error("expected the seeded volunteer role");

    expect(await createRoleAction("", "")).toEqual({
      error: "Role name is required.",
    });
    expect(await updateRoleAction(seeded.id as string, "  ", "")).toEqual({
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
      await updateRoleAction(seeded.id as string, "Renamed Volunteer", ""),
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
      await updateRoleAction(
        role.id,
        `${role.name} Renamed`,
        "Updated",
        "Renamed Role",
      ),
    ).toEqual({ success: true });
    const renamed = await roleByName(`${role.name} Renamed`);
    expect(renamed).toMatchObject({
      description: "Updated",
      label: "Renamed Role",
    });

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

  test("updateRoleAction and deleteRoleAction reject an unknown role id", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const missingId = crypto.randomUUID();

    expect(await updateRoleAction(missingId, "New Name", "")).toEqual({
      error: "Role not found.",
    });
    expect(await deleteRoleAction(missingId)).toEqual({
      error: "Role not found.",
    });
  });

  // #910. A role the platform seeded keeps its *key* -- migrations seed the
  // permission matrix by it across every tenant -- but its display name is the
  // tenant's own, and a tenant that has no board may retire Board outright.
  test("a built-in role keeps its key but takes a tenant label", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const seeded = await roleByName("volunteer");
    if (!seeded) throw new Error("expected the seeded volunteer role");
    const id = seeded.id as string;
    const description = (seeded.description as string | null) ?? "";

    expect(await updateRoleAction(id, "not_volunteer", description)).toEqual({
      error:
        "Built-in roles keep their name, which the platform uses to grant permissions. Change the display name instead.",
    });
    expect(await roleByName("not_volunteer")).toBeNull();

    expect(
      await updateRoleAction(id, "volunteer", description, "Helper"),
    ).toEqual({ success: true });
    expect(await roleByName("volunteer")).toMatchObject({
      id,
      name: "volunteer",
      label: "Helper",
    });

    // An empty label clears the column rather than storing "", so display
    // falls back to the platform's derived wording.
    expect(await updateRoleAction(id, "volunteer", description, "  ")).toEqual({
      success: true,
    });
    expect(await roleByName("volunteer")).toMatchObject({ label: null });
  });

  test("only the admin role refuses a rename and a delete", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const admin = await roleByName("admin");
    if (!admin) throw new Error("expected the seeded admin role");

    expect(await updateRoleAction(admin.id as string, "owner", "")).toEqual({
      error: "The admin role can't be renamed.",
    });
    expect(await deleteRoleAction(admin.id as string)).toEqual({
      error: "The admin role can't be deleted.",
    });

    expect(await roleByName("admin")).toMatchObject({
      id: admin.id,
      name: "admin",
    });
  });

  // The acceptance case for #910: a built-in with nobody in it is deletable,
  // and the "still assigned to N users" check -- not a list of names -- is
  // what stands in the way while somebody holds it. Restores the seed's board
  // role afterwards, since every suite shares this database.
  test("an unused built-in role can be deleted, taking its matrix with it", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const board = await roleByName("board");
    if (!board) throw new Error("expected the seeded board role");
    const boardId = board.id as string;

    const { data: matrix } = await adminClient
      .from("role_permissions")
      .select("resource_id, level")
      .eq("role_id", boardId);
    const grants = matrix ?? [];
    expect(grants.length).toBeGreaterThan(0);

    const { data: assignments } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role_id", boardId);
    const holders = (assignments ?? []).map((row) => row.user_id as string);
    expect(holders.length).toBeGreaterThan(0);

    expect(await deleteRoleAction(boardId)).toEqual({
      error: `This role is still assigned to ${holders.length} user${holders.length === 1 ? "" : "s"} and can't be deleted.`,
    });

    await adminClient.from("user_roles").delete().eq("role_id", boardId);
    expect(await deleteRoleAction(boardId)).toEqual({ success: true });
    expect(await roleByName("board")).toBeNull();

    // role_permissions cascades on the role, so no orphan matrix rows remain.
    const { count: leftovers } = await adminClient
      .from("role_permissions")
      .select("*", { count: "exact", head: true })
      .eq("role_id", boardId);
    expect(leftovers ?? 0).toBe(0);

    const { data: restored, error: restoreError } = await adminClient
      .from("roles")
      .insert({
        tenant_id: board.tenant_id,
        name: "board",
        label: board.label,
        description: board.description,
      })
      .select("id")
      .single();
    if (restoreError) throw restoreError;
    const restoredId = restored.id as string;
    await adminClient
      .from("role_permissions")
      .insert(grants.map((g) => ({ ...g, role_id: restoredId })));
    await adminClient
      .from("user_roles")
      .insert(
        holders.map((userId) => ({ user_id: userId, role_id: restoredId })),
      );
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

  for (const [label, email] of ROLES_WITHOUT_ADMINISTRATION) {
    test(`${label} account cannot create, rename or delete a role`, async () => {
      const role = await createCustomRole();
      currentSupabase = await signInAs(email);

      expect(
        await createRoleAction(`Denied Role ${crypto.randomUUID()}`, ""),
      ).toEqual(DENIED);
      expect(await updateRoleAction(role.id, "Denied Rename", "")).toEqual(
        DENIED,
      );
      expect(await deleteRoleAction(role.id)).toEqual(DENIED);

      // The denied rename/delete didn't land.
      expect(await roleByName(role.name)).toMatchObject({ id: role.id });

      await role.cleanup();
    });
  }
});

async function resourceId(key: string): Promise<string> {
  const { data, error } = await adminClient
    .from("resources")
    .select("id")
    .eq("key", key)
    .single();
  if (error || !data) throw error ?? new Error(`resource ${key} not found`);
  return data.id as string;
}

async function levelFor(roleId: string, resId: string) {
  const { data, error } = await adminClient
    .from("role_permissions")
    .select("level")
    .eq("role_id", roleId)
    .eq("resource_id", resId)
    .maybeSingle();
  if (error) throw error;
  return data?.level as string | undefined;
}

describe("administration/roles permissions matrix (integration)", () => {
  test("an empty update list succeeds without checking permission", async () => {
    currentSupabase = anonClient();
    expect(await updateRolePermissionsAction([])).toEqual({ success: true });
  });

  test("validates every level before checking permission", async () => {
    const role = await createCustomRole();
    const administration = await resourceId("administration");
    currentSupabase = anonClient();

    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "superadmin" },
      ]),
    ).toEqual({ error: "Unknown permission level." });

    // The invalid entry wasn't reached in isolation -- a batch with one bad
    // level rejects the whole call, none of it applied.
    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "manage" },
        { role_id: role.id, resource_id: administration, level: "bogus" },
      ]),
    ).toEqual({ error: "Unknown permission level." });
    expect(await levelFor(role.id, administration)).toBeUndefined();

    await role.cleanup();
  });

  test("requires administration:manage to update permissions", async () => {
    const role = await createCustomRole();
    const administration = await resourceId("administration");
    currentSupabase = anonClient();

    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "manage" },
      ]),
    ).toEqual(DENIED);
    expect(await levelFor(role.id, administration)).toBeUndefined();

    await role.cleanup();
  });

  test("admin can set and change a role's permission level on a resource", async () => {
    const role = await createCustomRole();
    const administration = await resourceId("administration");
    const finance = await resourceId("finance");
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    revalidatePathMock.mockClear();

    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "manage" },
        { role_id: role.id, resource_id: finance, level: "view" },
      ]),
    ).toEqual({ success: true });
    // One page since #946: the matrix is a tab on Roles, so the path it
    // revalidates is the Roles path, not a Permissions path of its own.
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/roles",
    );
    expect(await levelFor(role.id, administration)).toBe("manage");
    expect(await levelFor(role.id, finance)).toBe("view");

    // Upsert on (role_id, resource_id): re-applying changes the level rather
    // than erroring or duplicating the row.
    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "none" },
      ]),
    ).toEqual({ success: true });
    expect(await levelFor(role.id, administration)).toBe("none");
    expect(await levelFor(role.id, finance)).toBe("view");

    await role.cleanup();
  });

  for (const [label, email] of ROLES_WITHOUT_ADMINISTRATION) {
    test(`${label} account cannot update the permissions matrix`, async () => {
      const role = await createCustomRole();
      const administration = await resourceId("administration");
      currentSupabase = await signInAs(email);

      expect(
        await updateRolePermissionsAction([
          { role_id: role.id, resource_id: administration, level: "manage" },
        ]),
      ).toEqual(DENIED);
      expect(await levelFor(role.id, administration)).toBeUndefined();

      await role.cleanup();
    });
  }
});
