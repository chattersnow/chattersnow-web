// Integration test: exercises the real user/role-assignment/pending-grant/
// deactivation Server Actions in this file (checkUser/checkPermission, then
// the real `user_roles`/`pending_role_grants`/`deactivated_users` RLS)
// against a real local Supabase stack. No integration test previously
// touched any of these -- only permission-matrix.integration.test.ts
// exercises has_permission()/my_permissions() generically, not any
// Administration Server Action. Particular attention to
// deactivateUserAction/reactivateUserAction: proves a non-admin can't
// deactivate/reactivate a user, and that admin can. Requires
// `bun run db:start && bun run db:reset` first; run via
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

// admin.ts imports "server-only", which throws outside Next's bundler --
// stub it so this plain `bun test` run can import the real module. Needed
// here to create/delete throwaway auth.users rows (user_roles and
// deactivated_users both hard-FK to auth.users) and to look up the seeded
// admin's real id for the "can't deactivate yourself" case.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const {
  listRolesAction,
  listUsersAction,
  updateUserPreferredNameAction,
  assignRoleAction,
  revokeRoleAction,
  listPendingGrantsAction,
  createPendingGrantAction,
  revokePendingGrantAction,
  createInviteLinkAction,
  deactivateUserAction,
  reactivateUserAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };
const SIGNED_OUT = { error: "You must be signed in." };

async function createThrowawayUser() {
  const email = uniqueEmail("admin-user");
  const { data, error } = await serviceRoleClient.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const id = data.user.id;
  return {
    id,
    email,
    // Cascades: user_roles.user_id and deactivated_users.user_id both
    // `on delete cascade` from auth.users, so deleting the user is
    // sufficient cleanup for any role assignment/deactivation left behind.
    async cleanup() {
      await serviceRoleClient.auth.admin.deleteUser(id);
    },
  };
}

let adminUserIdCache: string | undefined;
async function adminUserId(): Promise<string> {
  if (adminUserIdCache) return adminUserIdCache;
  const { data, error } = await serviceRoleClient.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email === SEEDED_USERS.admin);
  if (!user) throw new Error(`seeded user ${SEEDED_USERS.admin} not found`);
  adminUserIdCache = user.id;
  return user.id;
}

async function userRolesFor(userId: string) {
  const { data, error } = await adminClient
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);
  if (error) throw error;
  // user_roles -> roles is a belongs-to (role_id FK), so supabase-js embeds
  // it as a single object at runtime -- but without generated Database
  // types the client can't express that in its own return type, so this
  // also tolerates an array just in case.
  return (data ?? []).flatMap((row) => {
    const roles = row.roles as unknown as { name: string } | { name: string }[];
    return Array.isArray(roles) ? roles.map((r) => r.name) : [roles.name];
  });
}

async function isDeactivated(userId: string) {
  const { data, error } = await adminClient
    .from("deactivated_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function createPendingGrant(role = "volunteer") {
  const email = uniqueEmail("admin-grant");
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createPendingGrantAction(email, role, "Test Grant");
  if ("error" in result) throw new Error(result.error);
  const { data, error } = await adminClient
    .from("pending_role_grants")
    .select("id")
    .eq("email", email)
    .single();
  if (error || !data) throw error ?? new Error("expected a pending grant");
  return { id: data.id as string, email };
}

describe("administration/users actions (integration)", () => {
  test("requires a signed-in user", async () => {
    // createPendingGrant() signs in as admin to stage its fixture, which
    // reassigns the shared currentSupabase -- so the anon client must be
    // set *after* fixture setup, not before.
    const user = await createThrowawayUser();
    const grant = await createPendingGrant();
    currentSupabase = anonClient();

    // No checkUser guard on these -- an anonymous client holds no
    // permissions, so each falls through to the permission check.
    expect(await listRolesAction()).toEqual(DENIED);
    expect(await listUsersAction()).toEqual(DENIED);
    expect(await revokeRoleAction(user.id, "volunteer")).toEqual(DENIED);
    expect(await listPendingGrantsAction()).toEqual(DENIED);
    expect(await reactivateUserAction(user.id)).toEqual(DENIED);

    // These check the signed-in user first.
    expect(await assignRoleAction(user.id, "volunteer")).toEqual(SIGNED_OUT);
    expect(
      await createPendingGrantAction(
        uniqueEmail("anon-grant"),
        "volunteer",
        "Name",
      ),
    ).toEqual(SIGNED_OUT);
    expect(await revokePendingGrantAction(grant.id)).toEqual(SIGNED_OUT);
    expect(await createInviteLinkAction(grant.id)).toEqual(SIGNED_OUT);
    expect(await deactivateUserAction(user.id)).toEqual(SIGNED_OUT);

    await adminClient.from("pending_role_grants").delete().eq("id", grant.id);
    await user.cleanup();
  });

  test("admin (administration manage) can list roles and users", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const roles = await listRolesAction();
    if (!("data" in roles)) throw new Error("expected data");
    expect(roles.data.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        "admin",
        "event_coordinator",
        "finance",
        "board",
        "volunteer",
      ]),
    );

    const users = await listUsersAction();
    if (!("data" in users)) throw new Error("expected data");
    const adminRow = users.data.find((u) => u.email === SEEDED_USERS.admin);
    expect(adminRow?.roles).toEqual(["admin"]);
  });

  test("admin can assign and revoke a role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const user = await createThrowawayUser();

    expect(await assignRoleAction(user.id, "volunteer")).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/users",
    );
    expect(await userRolesFor(user.id)).toEqual(["volunteer"]);

    const listed = await listUsersAction();
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.find((u) => u.user_id === user.id)?.roles).toEqual([
      "volunteer",
    ]);

    expect(await revokeRoleAction(user.id, "volunteer")).toEqual({
      success: true,
    });
    expect(await userRolesFor(user.id)).toEqual([]);

    await user.cleanup();
  });

  test("assignRoleAction and revokeRoleAction reject an unknown role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const user = await createThrowawayUser();

    expect(await assignRoleAction(user.id, "superadmin")).toEqual({
      error: "Unknown role.",
    });
    expect(await revokeRoleAction(user.id, "superadmin")).toEqual({
      error: "Unknown role.",
    });

    await user.cleanup();
  });

  test("admin can stage, list and revoke a pending grant", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const email = uniqueEmail("admin-pending");

    expect(
      await createPendingGrantAction(email, "volunteer", "Pending Person"),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/users",
    );

    const listed = await listPendingGrantsAction();
    if (!("data" in listed)) throw new Error("expected data");
    const grant = listed.data.find((g) => g.email === email);
    expect(grant).toMatchObject({ status: "pending", name: "Pending Person" });
    expect(grant?.roles.name).toBe("volunteer");
    if (!grant) throw new Error("expected the staged grant");

    expect(await revokePendingGrantAction(grant.id)).toEqual({
      success: true,
    });
    // Already revoked -- revoking again fails.
    expect(await revokePendingGrantAction(grant.id)).toEqual({
      error: "This grant has already been claimed or revoked.",
    });

    await adminClient.from("pending_role_grants").delete().eq("id", grant.id);
  });

  test("createPendingGrantAction validates email and role before inserting", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createPendingGrantAction("not-an-email", "volunteer", ""),
    ).toEqual({ error: "Enter a valid email address." });
    expect(
      await createPendingGrantAction(
        uniqueEmail("admin-badrole"),
        "superadmin",
        "",
      ),
    ).toEqual({ error: "Unknown role." });
  });

  test("createPendingGrantAction rejects a duplicate active grant for the same email and role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const email = uniqueEmail("admin-dup");

    expect(await createPendingGrantAction(email, "volunteer", "First")).toEqual(
      { success: true },
    );
    expect(
      await createPendingGrantAction(email, "volunteer", "Second"),
    ).toEqual({
      error: "A pending grant for this email and this role already exists.",
    });

    await adminClient.from("pending_role_grants").delete().eq("email", email);
  });

  test("admin can generate an invite link for a pending grant", async () => {
    const grant = await createPendingGrant();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await createInviteLinkAction(grant.id);
    if (!("success" in result)) throw new Error("expected success");
    expect(result.link).toContain("token_hash=");
    expect(result.link).toContain("type=invite");
    expect(result.link).toContain("next=/portal/set-password");

    const { data } = await adminClient
      .from("pending_role_grants")
      .select("invited_at")
      .eq("id", grant.id)
      .single();
    expect(data?.invited_at).not.toBeNull();

    await adminClient.from("pending_role_grants").delete().eq("id", grant.id);
  });

  test("createInviteLinkAction rejects a missing or already-resolved grant", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createInviteLinkAction(crypto.randomUUID())).toEqual({
      error: "This pending grant no longer exists.",
    });

    const grant = await createPendingGrant();
    expect(await revokePendingGrantAction(grant.id)).toEqual({
      success: true,
    });
    expect(await createInviteLinkAction(grant.id)).toEqual({
      error: "This grant has already been claimed or revoked.",
    });

    await adminClient.from("pending_role_grants").delete().eq("id", grant.id);
  });

  test("admin can deactivate and reactivate a user, but not themselves", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const user = await createThrowawayUser();

    expect(await deactivateUserAction(user.id)).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/users",
    );
    expect(await isDeactivated(user.id)).toBe(true);

    // Already deactivated -- deactivating again fails.
    expect(await deactivateUserAction(user.id)).toEqual({
      error: "This user is already deactivated.",
    });

    expect(await reactivateUserAction(user.id)).toEqual({ success: true });
    expect(await isDeactivated(user.id)).toBe(false);

    // Not deactivated -- reactivating again fails.
    expect(await reactivateUserAction(user.id)).toEqual({
      error: "This user is not deactivated.",
    });

    expect(await deactivateUserAction(await adminUserId())).toEqual({
      error: "You can't deactivate your own account.",
    });

    await user.cleanup();
  });

  // The seven accounts with no administration access at all: four single-role
  // seeded accounts, the multi-role account (event_coordinator + volunteer,
  // neither grants administration), the no-role account, and a deactivated
  // former admin. Every action here must deny each of them, and a denied
  // call must never touch the database.
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
    test(`${label} account cannot manage users, roles or pending access`, async () => {
      const user = await createThrowawayUser();
      const grant = await createPendingGrant();
      currentSupabase = await signInAs(email);

      expect(await listRolesAction()).toEqual(DENIED);
      expect(await listUsersAction()).toEqual(DENIED);
      expect(await assignRoleAction(user.id, "volunteer")).toEqual(DENIED);
      expect(await revokeRoleAction(user.id, "volunteer")).toEqual(DENIED);
      expect(await listPendingGrantsAction()).toEqual(DENIED);
      expect(
        await createPendingGrantAction(
          uniqueEmail("denied-grant"),
          "volunteer",
          "Name",
        ),
      ).toEqual(DENIED);
      expect(await revokePendingGrantAction(grant.id)).toEqual(DENIED);
      expect(await createInviteLinkAction(grant.id)).toEqual(DENIED);
      expect(await deactivateUserAction(user.id)).toEqual(DENIED);
      expect(await reactivateUserAction(user.id)).toEqual(DENIED);

      // None of the denied calls above landed.
      expect(await userRolesFor(user.id)).toEqual([]);
      expect(await isDeactivated(user.id)).toBe(false);

      await adminClient.from("pending_role_grants").delete().eq("id", grant.id);
      await user.cleanup();
    });
  }
});

describe("updateUserPreferredNameAction (integration)", () => {
  async function personFor(userId: string) {
    const { data, error } = await adminClient
      .from("people")
      .select("id, name, preferred_name, auth_user_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  test("listUsersAction surfaces the linked person and preferred name", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const listed = await listUsersAction();
    if ("error" in listed) throw new Error(listed.error);

    const admin = listed.data.find((u) => u.email === SEEDED_USERS.admin);
    expect(admin?.person_id).toBeTruthy();
    expect(admin?.person_name).toBe("Avery Morgan");
    // seed.sql sets this one, so it proves the join, not just the column.
    expect(admin?.preferred_name).toBe("Ave");
  });

  test("an admin can set and then clear another account's preferred name", async () => {
    const user = await createThrowawayUser();
    try {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(await updateUserPreferredNameAction(user.id, "Nickname")).toEqual({
        success: true,
      });
      expect((await personFor(user.id))?.preferred_name).toBe("Nickname");

      // Blank clears the override rather than storing an empty string, so
      // personDisplayName falls back to the real name.
      expect(await updateUserPreferredNameAction(user.id, "   ")).toEqual({
        success: true,
      });
      expect((await personFor(user.id))?.preferred_name).toBeNull();
    } finally {
      await user.cleanup();
    }
  });

  test("it provisions a people row for an account that has never signed in", async () => {
    const user = await createThrowawayUser();
    try {
      expect(await personFor(user.id)).toBeNull();

      currentSupabase = await signInAs(SEEDED_USERS.admin);
      expect(await updateUserPreferredNameAction(user.id, "Newcomer")).toEqual({
        success: true,
      });

      const person = await personFor(user.id);
      expect(person).not.toBeNull();
      expect(person?.preferred_name).toBe("Newcomer");
    } finally {
      await user.cleanup();
    }
  });

  test("a non-admin cannot rename anyone", async () => {
    const adminId = await adminUserId();
    for (const email of [SEEDED_USERS.volunteer, SEEDED_USERS.finance]) {
      currentSupabase = await signInAs(email);
      expect(await updateUserPreferredNameAction(adminId, "Hacked")).toEqual(
        DENIED,
      );
    }
    // The seeded value is untouched.
    expect((await personFor(adminId))?.preferred_name).toBe("Ave");
  });

  test("a signed-out caller cannot rename anyone", async () => {
    const adminId = await adminUserId();
    currentSupabase = anonClient();
    expect(await updateUserPreferredNameAction(adminId, "Hacked")).toEqual(
      SIGNED_OUT,
    );
  });
});
