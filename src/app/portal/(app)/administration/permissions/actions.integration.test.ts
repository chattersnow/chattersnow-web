// Integration test: exercises the real updateRolePermissionsAction
// (checkPermission, then the real `role_permissions` RLS) against a real
// local Supabase stack. This is the action that edits the matrix itself --
// distinct from permission-matrix.integration.test.ts, which only exercises
// has_permission()/my_permissions() reading the seeded matrix, never a
// write path. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
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

const { updateRolePermissionsAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

async function createCustomRole() {
  const { data, error } = await adminClient
    .from("roles")
    .insert({
      name: `Integration Role ${crypto.randomUUID()}`,
      description: "Created for an integration test",
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("roles").delete().eq("id", id);
    },
  };
}

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

describe("administration/permissions actions (integration)", () => {
  test("an empty update list succeeds without checking permission", async () => {
    currentSupabase = anonClient();
    expect(await updateRolePermissionsAction([])).toEqual({ success: true });
  });

  test("validates every level before checking permission", async () => {
    currentSupabase = anonClient();
    const role = await createCustomRole();
    const administration = await resourceId("administration");

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
    currentSupabase = anonClient();
    const role = await createCustomRole();
    const administration = await resourceId("administration");

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

    expect(
      await updateRolePermissionsAction([
        { role_id: role.id, resource_id: administration, level: "manage" },
        { role_id: role.id, resource_id: finance, level: "view" },
      ]),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/permissions",
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
