// Integration coverage for #707 Phase 2: tenant_id on every tenant table, the
// per-tenant permission core, per-tenant uniqueness, and the two tenant
// resolvers (current_tenant_id() for sessions, default_tenant_id() for
// everything else), against a real local Supabase stack.
//
// A second *active* tenant exists for the whole file. That is the state Phase
// 2 fails closed in: default_tenant_id() has no sole tenant to fall back to,
// so anything that writes without a session and without an explicit
// tenant_id -- the anon intake RPCs, the public_* views -- gets null. Rows
// created here for the second tenant therefore always name it explicitly,
// and are removed before the tenant is (its foreign keys are `no action`).
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";
import { TENANT_TABLES } from "../../../test/tenant-tables";

const service = serviceRoleClient();
const anon = anonClient();

let chatterTenantId: string;
let secondTenantId: string;
let secondAdminRoleId: string;

beforeAll(async () => {
  const { data: initial, error: initialError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (initialError) throw initialError;
  chatterTenantId = initial.id as string;

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({
      name: "Scope Test Org",
      slug: `scope-${crypto.randomUUID().slice(0, 8)}`,
      plan: "white_label",
    })
    .select("id")
    .single();
  if (tenantError) throw tenantError;
  secondTenantId = tenant.id as string;

  // The same role name the first tenant already has: roles_name_key is
  // per-tenant now (20260906020000).
  const { data: role, error: roleError } = await service
    .from("roles")
    .insert({ tenant_id: secondTenantId, name: "admin", description: "test" })
    .select("id")
    .single();
  if (roleError) throw roleError;
  secondAdminRoleId = role.id as string;

  const { data: resource } = await service
    .from("resources")
    .select("id")
    .eq("key", "administration")
    .single();
  // No tenant_id: set_tenant_id_from_role derives it from the role.
  const { error: permissionError } = await service
    .from("role_permissions")
    .insert({
      role_id: secondAdminRoleId,
      resource_id: resource!.id,
      level: "manage",
    });
  if (permissionError) throw permissionError;
});

afterAll(async () => {
  // Order matters: every tenant-table foreign key to tenants is `no action`,
  // and volunteer_applications references people.
  await service
    .from("volunteer_applications")
    .delete()
    .eq("tenant_id", secondTenantId);
  await service.from("people").delete().eq("tenant_id", secondTenantId);
  await service.from("app_settings").delete().eq("tenant_id", secondTenantId);
  await service.from("roles").delete().eq("tenant_id", secondTenantId);
  const { error } = await service
    .from("tenants")
    .delete()
    .eq("id", secondTenantId);
  // A leftover active tenant makes default_tenant_id() null for every later
  // test file and for the public site, so this must not fail quietly.
  if (error) throw error;
});

describe("tenant_id on every tenant table", () => {
  test("no tenant table holds a row without a tenant", async () => {
    for (const table of TENANT_TABLES) {
      const { count, error } = await service
        .from(table)
        .select("tenant_id", { count: "exact", head: true })
        .is("tenant_id", null);
      expect(error, table).toBeNull();
      expect(count, table).toBe(0);
    }
  });

  test("a signed-in insert lands in the caller's tenant without naming it", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const { data, error } = await admin
      .from("programs")
      .insert({ name: `Scope ${crypto.randomUUID().slice(0, 8)}` })
      .select("id, tenant_id")
      .single();
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(chatterTenantId);
    await admin.from("programs").delete().eq("id", data!.id);
  });

  test("a role-derived row takes its tenant from the role, whatever the caller says", async () => {
    // A row that names the wrong tenant is corrected, not rejected: the
    // trigger is unconditional and the composite foreign key then holds.
    const { data, error } = await service
      .from("pending_role_grants")
      .insert({
        email: uniqueEmail("derived"),
        role_id: secondAdminRoleId,
        tenant_id: chatterTenantId,
      })
      .select("id, tenant_id")
      .single();
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(secondTenantId);
    await service.from("pending_role_grants").delete().eq("id", data!.id);
  });
});

describe("default_tenant_id()", () => {
  test("is null for a sessionless caller while two tenants are active", async () => {
    const { data, error } = await anon.rpc("default_tenant_id");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("so the anon views show nothing rather than everything", async () => {
    const { data, error } = await anon.from("public_events").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("is the caller's tenant for a signed-in user", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { data } = await finance.rpc("default_tenant_id");
    expect(data).toBe(chatterTenantId);
  });
});

describe("per-tenant permissions", () => {
  // multi@ is an event_coordinator + volunteer in the first tenant. Joining
  // the second tenant gives it two memberships and therefore no selection.
  beforeAll(async () => {
    const { error } = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.multi,
      tenant_id: secondTenantId,
      kind: "member",
    });
    if (error) throw error;
  });

  afterAll(async () => {
    const multi = await signInAs(SEEDED_USERS.multi);
    await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
    await service
      .from("user_roles")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.multi)
      .eq("tenant_id", secondTenantId);
    await service
      .from("tenant_memberships")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.multi)
      .eq("tenant_id", secondTenantId);
  });

  test("no selection means no permissions, not the first tenant's", async () => {
    const multi = await signInAs(SEEDED_USERS.multi);
    await service
      .from("user_tenant_selection")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.multi);

    const { data } = await multi.rpc("my_permissions");
    expect(
      (data ?? []).every((row: { level: string }) => row.level === "none"),
    ).toBe(true);
  });

  test("roles held in one tenant say nothing in another", async () => {
    const multi = await signInAs(SEEDED_USERS.multi);

    await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
    const home = await multi.rpc("has_permission", {
      p_resource_key: "events",
      p_min_level: "manage",
    });
    expect(home.data).toBe(true);

    await multi.rpc("set_current_tenant", { p_tenant_id: secondTenantId });
    const away = await multi.rpc("has_permission", {
      p_resource_key: "events",
      p_min_level: "manage",
    });
    expect(away.data).toBe(false);

    // ... and a role granted there applies there only.
    const { error } = await service
      .from("user_roles")
      .insert({ user_id: SEEDED_USER_IDS.multi, role_id: secondAdminRoleId });
    expect(error).toBeNull();
    const awayAdmin = await multi.rpc("is_admin");
    expect(awayAdmin.data).toBe(true);

    await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
    const homeAdmin = await multi.rpc("is_admin");
    expect(homeAdmin.data).toBe(false);
  });

  test("the roles a user can see are the current tenant's", async () => {
    const multi = await signInAs(SEEDED_USERS.multi);
    await multi.rpc("set_current_tenant", { p_tenant_id: secondTenantId });
    const { data } = await multi.from("roles").select("id, name");
    expect(data).toEqual([{ id: secondAdminRoleId, name: "admin" }]);
    await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
  });

  test("the administration user list is the current tenant's members", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const { data, error } = await admin.rpc("list_portal_users");
    expect(error).toBeNull();
    const ids = (data ?? []).map((row: { user_id: string }) => row.user_id);
    expect(ids).toContain(SEEDED_USER_IDS.finance);

    // Not the second tenant's admin, who is a member of the first tenant but
    // holds the admin role only in the second.
    const multiRow = (data ?? []).find(
      (row: { user_id: string }) => row.user_id === SEEDED_USER_IDS.multi,
    ) as { roles: string[] } | undefined;
    expect(multiRow?.roles).toEqual(["event_coordinator", "volunteer"]);
  });
});

describe("claim_pending_role_grants()", () => {
  test("grants into the tenant the invite was staged in, which joins it", async () => {
    const email = uniqueEmail("claim");
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (createError) throw createError;
    const userId = created.user.id;

    try {
      const { error: stageError } = await service
        .from("pending_role_grants")
        .insert({ email, role_id: secondAdminRoleId });
      expect(stageError).toBeNull();

      const invitee = await signIn(email);
      const { data: claimed, error } = await invitee.rpc(
        "claim_pending_role_grants",
      );
      expect(error).toBeNull();
      expect(claimed).toBe(1);

      const { data: memberships } = await service
        .from("tenant_memberships")
        .select("tenant_id, kind")
        .eq("user_id", userId);
      expect(memberships).toEqual([
        { tenant_id: secondTenantId, kind: "member" },
      ]);

      const { data: roles } = await service
        .from("user_roles")
        .select("tenant_id, role_id")
        .eq("user_id", userId);
      expect(roles).toEqual([
        { tenant_id: secondTenantId, role_id: secondAdminRoleId },
      ]);

      // One membership, so no selection needed: the invitee is admin there.
      const { data: isAdmin } = await invitee.rpc("is_admin");
      expect(isAdmin).toBe(true);
    } finally {
      // The claim stamped this user on the grant (claimed_by) and on the
      // audit rows it wrote (actor_id); both reference auth.users without a
      // cascade, so the account cannot go until they are gone.
      await service
        .from("pending_role_grants")
        .delete()
        .eq("claimed_by", userId);
      await service
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", userId);
      const { error: deleteError } =
        await service.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
    }
  });
});

describe("per-tenant uniqueness", () => {
  test("the same person email can exist in both tenants, once each", async () => {
    const email = uniqueEmail("dup");
    const first = await service
      .from("people")
      .insert({
        tenant_id: chatterTenantId,
        name: "Dup One",
        email,
        source_type: "other",
      })
      .select("id")
      .single();
    expect(first.error).toBeNull();
    const second = await service
      .from("people")
      .insert({
        tenant_id: secondTenantId,
        name: "Dup Two",
        email,
        source_type: "other",
      })
      .select("id")
      .single();
    expect(second.error).toBeNull();
    const third = await service.from("people").insert({
      tenant_id: chatterTenantId,
      name: "Dup Three",
      email,
      source_type: "other",
    });
    expect(third.error?.code).toBe("23505");

    await service.from("people").delete().eq("id", first.data!.id);
  });

  test("a merge cannot reach across tenants", async () => {
    const { data: away } = await service
      .from("people")
      .select("id")
      .eq("tenant_id", secondTenantId)
      .limit(1)
      .single();
    const { data: home } = await service
      .from("people")
      .select("id")
      .eq("tenant_id", chatterTenantId)
      .eq("is_anonymous", false)
      .limit(1)
      .single();
    const admin = await signInAs(SEEDED_USERS.admin);
    const { error } = await admin.rpc("person_merge_blockers", {
      p_survivor_id: home!.id,
      p_duplicate_id: away!.id,
    });
    expect(error?.message).toContain("No such person");
  });

  test("the same setting key can exist in both tenants, and org_fiscal_year reads the current one", async () => {
    const { error } = await service.from("app_settings").insert({
      tenant_id: secondTenantId,
      key: "org.fiscal_year_start_month",
      value: 1,
    });
    expect(error).toBeNull();

    const multi = await signInAs(SEEDED_USERS.multi);
    await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.multi,
      tenant_id: secondTenantId,
      kind: "member",
    });
    try {
      await multi.rpc("set_current_tenant", { p_tenant_id: secondTenantId });
      const away = await multi
        .from("org_fiscal_year")
        .select("start_month")
        .maybeSingle();
      expect(away.data?.start_month).toBe(1);

      await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
      const home = await multi
        .from("org_fiscal_year")
        .select("start_month")
        .maybeSingle();
      expect(home.data?.start_month).toBe(7);
    } finally {
      await multi.rpc("set_current_tenant", { p_tenant_id: chatterTenantId });
      await service
        .from("tenant_memberships")
        .delete()
        .eq("user_id", SEEDED_USER_IDS.multi)
        .eq("tenant_id", secondTenantId);
    }
  });

  test("a volunteer reference code is unique within a tenant", async () => {
    const { data: existing } = await service
      .from("volunteer_applications")
      .select("person_id, name, email, reference_code")
      .eq("tenant_id", chatterTenantId)
      .limit(1)
      .single();
    const { data: person } = await service
      .from("people")
      .insert({
        tenant_id: secondTenantId,
        name: "Ref Holder",
        source_type: "other",
      })
      .select("id")
      .single();

    const away = await service.from("volunteer_applications").insert({
      tenant_id: secondTenantId,
      person_id: person!.id,
      name: existing!.name,
      email: existing!.email,
      reference_code: existing!.reference_code,
    });
    expect(away.error).toBeNull();

    const home = await service.from("volunteer_applications").insert({
      tenant_id: chatterTenantId,
      person_id: existing!.person_id,
      name: existing!.name,
      email: existing!.email,
      reference_code: existing!.reference_code,
    });
    expect(home.error?.code).toBe("23505");
  });
});
