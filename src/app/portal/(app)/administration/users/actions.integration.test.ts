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
  // A member of the seeded tenant, as a first sign-in would make it: since
  // #707 Phase 4 an admin may only deactivate an account whose sole
  // membership is their own tenant.
  const { data: tenant } = await serviceRoleClient
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  await serviceRoleClient
    .from("tenant_memberships")
    .insert({ user_id: id, tenant_id: tenant!.id, kind: "member" });
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

/** The tenant every fixture here belongs to; the seeded one. */
let seededTenantCache: string | undefined;
async function seededTenantId(): Promise<string> {
  if (seededTenantCache) return seededTenantCache;
  const { data, error } = await serviceRoleClient
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  seededTenantCache = data.id as string;
  return seededTenantCache;
}

/**
 * An account that exists and belongs to a *different* organization -- the
 * shape #759 is about.
 *
 * The tenant is created `archived` on purpose, the way
 * `notifications/preferences.integration.test.ts` does it: this file needs a
 * second tenant only to *exist*, and a second **active** one would knock
 * default_tenant_id() off its sole-tenant fallback for every other integration
 * file sharing this database.
 */
async function createOutsiderInAnotherTenant() {
  const email = uniqueEmail("outsider");
  const { data: user, error: userError } =
    await serviceRoleClient.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
  if (userError || !user.user) {
    throw userError ?? new Error("createUser failed");
  }

  const { data: tenant, error: tenantError } = await serviceRoleClient
    .from("tenants")
    .insert({
      name: "Outsider Org",
      slug: `outsider-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (tenantError) throw tenantError;

  const { error: membershipError } = await serviceRoleClient
    .from("tenant_memberships")
    .insert({
      user_id: user.user.id,
      tenant_id: tenant.id,
      kind: "member",
    });
  if (membershipError) throw membershipError;

  return {
    email,
    homeTenantId: tenant.id as string,
    async cleanup() {
      await serviceRoleClient.auth.admin.deleteUser(user.user!.id);
      // delete_tenant() rather than a bare delete on `tenants`: every foreign
      // key to tenants is `no action`, so a bare delete only works while
      // nothing has been seeded into the tenant -- and what gets seeded grows
      // (#707 Phase 5b adds retention rules by trigger). The RPC walks the
      // catalog, so it stays right as tables are added, and it requires the
      // tenant to be archived, which this one already is.
      const { error } = await serviceRoleClient.rpc("delete_tenant", {
        p_tenant_id: tenant.id,
      });
      if (error) throw error;
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

  // #759. The magic-link fallback in mintInviteLink turns "this address already
  // has an account" into a token that /auth/confirm verifies into a *session*
  // as that account, landing on /portal/set-password. Staging a grant is not
  // restricted by address, so before this an admin could take over any account
  // whose email they knew. These two cases are the whole fix: the address that
  // is not theirs is refused, and the ordinary re-invite still works.
  describe("an address that is not this organization's to invite (#759)", () => {
    test("staging a grant for it is refused by the database", async () => {
      const outsider = await createOutsiderInAnotherTenant();
      try {
        currentSupabase = await signInAs(SEEDED_USERS.admin);
        const result = await createPendingGrantAction(
          outsider.email,
          "volunteer",
          "Takeover",
        );
        expect("error" in result).toBe(true);

        const { data } = await serviceRoleClient
          .from("pending_role_grants")
          .select("id")
          .eq("email", outsider.email);
        expect(data ?? []).toHaveLength(0);
      } finally {
        await outsider.cleanup();
      }
    });

    test("a grant staged before the policy existed still mints no link", async () => {
      // Staged as service_role, which is exactly the pre-migration state: the
      // row is already in the table, so the policy cannot help and the action's
      // own check is the only thing standing between an admin and a session as
      // somebody else.
      const outsider = await createOutsiderInAnotherTenant();
      let grantId: string | null = null;
      try {
        const { data: role } = await serviceRoleClient
          .from("roles")
          .select("id")
          .eq("tenant_id", await seededTenantId())
          .eq("name", "volunteer")
          .single();
        const { data: staged, error: stageError } = await serviceRoleClient
          .from("pending_role_grants")
          .insert({
            email: outsider.email,
            role_id: role!.id,
            tenant_id: await seededTenantId(),
          })
          .select("id")
          .single();
        if (stageError) throw stageError;
        grantId = staged!.id as string;

        currentSupabase = await signInAs(SEEDED_USERS.admin);
        const result = await createInviteLinkAction(grantId);
        expect(result).toEqual({
          error:
            "That address already has an account that is not this organization's, so a link cannot be sent to it. Ask them to sign in with the account they have — their access here is waiting for them.",
        });
      } finally {
        if (grantId) {
          await serviceRoleClient
            .from("pending_role_grants")
            .delete()
            .eq("id", grantId);
        }
        await outsider.cleanup();
      }
    });

    test("an address whose only account is in this organization still gets a link", async () => {
      // The case the fallback was written for, and the reason this is a
      // targeted check rather than "refuse every existing account".
      const insider = await createThrowawayUser();
      const grant = await createPendingGrant();
      try {
        await serviceRoleClient
          .from("pending_role_grants")
          .update({ email: insider.email })
          .eq("id", grant.id);

        currentSupabase = await signInAs(SEEDED_USERS.admin);
        const result = await createInviteLinkAction(grant.id);
        if (!("success" in result)) {
          throw new Error(`expected a link, got ${JSON.stringify(result)}`);
        }
        expect(result.link).toContain("type=magiclink");
      } finally {
        await serviceRoleClient
          .from("pending_role_grants")
          .delete()
          .eq("id", grant.id);
        await insider.cleanup();
      }
    });
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
