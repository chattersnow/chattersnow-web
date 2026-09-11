// Integration coverage for people_with_permission() (#742) against a real
// local Supabase stack.
//
// This function exists because nothing else could answer the question. It runs
// on the service-role client, which RLS does not apply to, and it is the only
// thing deciding which organization's staff hear about which organization's
// inbound submissions -- so the tenant boundary below is the case this file
// is really for.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";

const service = serviceRoleClient();
const anon = anonClient();

let chatterTenantId: string;
let otherTenantId: string;
let otherRoleId: string;
let otherPersonId: string;

async function holders(
  tenantId: string,
  resourceKeys: string[],
  minLevel: "view" | "manage",
) {
  const { data, error } = await service.rpc("people_with_permission", {
    p_tenant_id: tenantId,
    p_resource_keys: resourceKeys,
    p_min_level: minLevel,
  });
  if (error) throw error;
  return (data ?? []) as { person_id: string; email: string }[];
}

const emailsOf = (rows: { email: string }[]) => rows.map((r) => r.email).sort();

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  chatterTenantId = tenant.id as string;

  // Archived, not active, for the same reason preferences.integration.test.ts
  // makes its second tenant archived: a second *active* tenant would knock
  // default_tenant_id() off its sole-tenant fallback for every other
  // integration file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Permission Test Org",
      slug: `perm-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  // The same account, holding a role in the second tenant and having a person
  // row there. That is a legal shape -- one account can be a person in several
  // tenants -- and it is precisely the shape a tenant-blind join would leak
  // through: without the composite predicate, this person would answer for
  // Chatter Snow too.
  const { data: role, error: roleError } = await service
    .from("roles")
    .insert({ tenant_id: otherTenantId, name: "admin" })
    .select("id")
    .single();
  if (roleError) throw roleError;
  otherRoleId = role.id as string;

  const { data: resource, error: resourceError } = await service
    .from("resources")
    .select("id")
    .eq("key", "volunteers")
    .single();
  if (resourceError) throw resourceError;

  const { error: grantError } = await service.from("role_permissions").insert({
    tenant_id: otherTenantId,
    role_id: otherRoleId,
    resource_id: resource.id as string,
    level: "manage",
  });
  if (grantError) throw grantError;

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: otherTenantId,
      auth_user_id: SEEDED_USER_IDS.admin,
      name: "Other Tenant Admin",
      email: `perm-other-${crypto.randomUUID().slice(0, 8)}@example.test`,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (personError) throw personError;
  otherPersonId = person.id as string;

  const { error: userRoleError } = await service.from("user_roles").insert({
    tenant_id: otherTenantId,
    user_id: SEEDED_USER_IDS.admin,
    role_id: otherRoleId,
  });
  if (userRoleError) throw userRoleError;
});

afterAll(async () => {
  await service.from("tenant_modules").delete().eq("tenant_id", otherTenantId);
  await service.from("user_roles").delete().eq("tenant_id", otherTenantId);
  await service.from("people").delete().eq("tenant_id", otherTenantId);
  await service
    .from("role_permissions")
    .delete()
    .eq("tenant_id", otherTenantId);
  await service.from("roles").delete().eq("tenant_id", otherTenantId);
  await service
    .from("tenant_memberships")
    .delete()
    .eq("tenant_id", otherTenantId);
  // Since #707 Phase 5b a trigger on tenants seeds every new tenant's
  // retention rules, and that foreign key is `no action` like every other one
  // to tenants -- so these go first or the tenant survives the run and the
  // next file to read a per-tenant table as service_role sees two.
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  const { error } = await service
    .from("tenants")
    .delete()
    .eq("id", otherTenantId);
  if (error) throw error;
});

describe("who it returns", () => {
  test("only the level asked for", async () => {
    // The seeded matrix gives volunteers:manage to admin alone and
    // volunteers:view to event_coordinator and volunteer.
    expect(
      emailsOf(await holders(chatterTenantId, ["volunteers"], "manage")),
    ).toEqual([SEEDED_USERS.admin]);

    const viewers = emailsOf(
      await holders(chatterTenantId, ["volunteers"], "view"),
    );
    expect(viewers).toContain(SEEDED_USERS.admin);
    expect(viewers).toContain(SEEDED_USERS.coordinator);
  });

  test("the union of several resources, once per person", async () => {
    const rows = await holders(
      chatterTenantId,
      ["communications", "administration"],
      "manage",
    );
    // The admin holds manage on both, so a join without the grouping would
    // return them twice and mail them twice.
    expect(emailsOf(rows)).toEqual([SEEDED_USERS.admin]);
  });

  test("nobody, for a resource key that does not exist", async () => {
    expect(await holders(chatterTenantId, ["not_a_resource"], "view")).toEqual(
      [],
    );
  });
});

describe("who it leaves out", () => {
  test("a deactivated account, however its roles read", async () => {
    // former@example.test is an event_coordinator (volunteers:view) whose
    // account has been deactivated. has_permission() refuses them and so must
    // this: a deactivated member is not a recipient.
    const viewers = emailsOf(
      await holders(chatterTenantId, ["volunteers"], "view"),
    );
    expect(viewers).not.toContain(SEEDED_USERS.former);
  });

  test("an account with no people row", async () => {
    // volunteer@example.test holds volunteers:view but has never visited
    // /portal/account, so nothing in `people` points at it.
    const viewers = emailsOf(
      await holders(chatterTenantId, ["volunteers"], "view"),
    );
    expect(viewers).not.toContain(SEEDED_USERS.volunteer);
  });

  test("a person with no email address", async () => {
    const before = await holders(otherTenantId, ["volunteers"], "manage");
    expect(before.map((row) => row.person_id)).toEqual([otherPersonId]);

    await service
      .from("people")
      .update({ email: null })
      .eq("id", otherPersonId);
    try {
      expect(await holders(otherTenantId, ["volunteers"], "manage")).toEqual(
        [],
      );
    } finally {
      await service
        .from("people")
        .update({ email: `perm-restored-${crypto.randomUUID()}@example.test` })
        .eq("id", otherPersonId);
    }
  });

  test("a support grant, which is access to look and not consent to hear", async () => {
    // Granting the role already created the membership, so this converts the
    // existing one rather than adding a second: the table is unique on
    // (user_id, tenant_id). The check constraint is what forces the expiry and
    // the reason to come with it.
    const membership = service
      .from("tenant_memberships")
      .update({
        kind: "support",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        reason: "Integration test",
      })
      .eq("tenant_id", otherTenantId)
      .eq("user_id", SEEDED_USER_IDS.admin);
    const { error } = await membership;
    if (error) throw error;

    try {
      expect(await holders(otherTenantId, ["volunteers"], "manage")).toEqual(
        [],
      );
    } finally {
      await service
        .from("tenant_memberships")
        .update({ kind: "member", expires_at: null, reason: null })
        .eq("tenant_id", otherTenantId)
        .eq("user_id", SEEDED_USER_IDS.admin);
    }
  });
});

describe("module entitlements (#900)", () => {
  // The gap this closes: the senders run on a service-role client with no
  // session and no row-level security underneath, so a tenant that is not
  // buying Volunteers would keep receiving volunteer-application mail unless
  // this function filters on the module itself.
  test("nobody from a module the tenant is not entitled to", async () => {
    // The second tenant was created by a plain insert rather than by
    // provision_tenant(), so it has no tenant_modules rows -- and everyone is
    // still elected, which is the fail-open half of the resolution order.
    expect(
      (await holders(otherTenantId, ["volunteers"], "manage")).map(
        (row) => row.person_id,
      ),
    ).toEqual([otherPersonId]);

    const { error } = await service.from("tenant_modules").insert({
      tenant_id: otherTenantId,
      module_key: "volunteers",
      enabled: false,
    });
    if (error) throw error;

    try {
      expect(await holders(otherTenantId, ["volunteers"], "manage")).toEqual(
        [],
      );
      // Another tenant's entitlements are nobody else's: Chatter Snow still
      // hears about its own volunteers.
      expect(
        emailsOf(await holders(chatterTenantId, ["volunteers"], "manage")),
      ).toEqual([SEEDED_USERS.admin]);
    } finally {
      await service
        .from("tenant_modules")
        .delete()
        .eq("tenant_id", otherTenantId)
        .eq("module_key", "volunteers");
    }

    expect(
      (await holders(otherTenantId, ["volunteers"], "manage")).map(
        (row) => row.person_id,
      ),
    ).toEqual([otherPersonId]);
  });
});

describe("the tenant boundary", () => {
  test("a role held in one tenant never elects a person in another", async () => {
    const chatter = await holders(chatterTenantId, ["volunteers"], "manage");
    const other = await holders(otherTenantId, ["volunteers"], "manage");

    expect(other.map((row) => row.person_id)).toEqual([otherPersonId]);
    expect(chatter.map((row) => row.person_id)).not.toContain(otherPersonId);
    // Same account on both sides; only the person rows differ. That is what
    // makes this worth asserting rather than assuming.
    expect(chatter).toHaveLength(1);
  });
});

describe("who may call it", () => {
  test("not an anonymous caller", async () => {
    const { error } = await anon.rpc("people_with_permission", {
      p_tenant_id: chatterTenantId,
      p_resource_keys: ["volunteers"],
      p_min_level: "manage",
    });
    expect(error).not.toBeNull();
  });

  test("not even an administrator's session", async () => {
    // Enumerating who else holds a permission is a sender's concern. A signed
    // -in session that wants its own answer has has_permission().
    const admin = await signInAs(SEEDED_USERS.admin);
    const { error } = await admin.rpc("people_with_permission", {
      p_tenant_id: chatterTenantId,
      p_resource_keys: ["volunteers"],
      p_min_level: "manage",
    });
    expect(error).not.toBeNull();
  });
});
