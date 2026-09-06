// #707 Phase 4 against a real local stack: a second tenant is provisioned
// with one call, its first admin signs in through the staged grant, grants
// and ends support access, removes a member, cannot deactivate a shared
// account, publishes its own copy and colours (which the public surface
// serves by host and nobody else's host does), exports everything, and is
// finally archived and deleted -- leaving nothing behind but the accounts.
//
// The tenant is active for the length of the file, so every sessionless
// read here names a host; the seeded tenant gets one of its own for the
// duration so it can be asked for by host rather than as "the only one".
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const A_HOST = `seed-${run}.example.test`;
const B_HOST = `prov-${run}.example.test`;
const SLUG = `prov-${run}`;

let tenantA: string;
let tenantB: string;
const adminEmail = uniqueEmail("prov-admin");
const supportEmail = uniqueEmail("prov-support");
const memberEmail = uniqueEmail("prov-member");
const sharedEmail = uniqueEmail("prov-shared");
const users: string[] = [];
let admin: SupabaseClient;
let adminUserId: string;
let supportUserId: string;
let memberUserId: string;
let sharedUserId: string;

// Untyped on purpose: the client has no generated Database type, so every
// result would otherwise be `unknown | null` and each assertion a cast.
async function must(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

async function createUser(email: string) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  users.push(data.user.id);
  return data.user.id;
}

async function deleteUser(userId: string) {
  await service
    .from("audit_log")
    .update({ actor_id: null })
    .eq("actor_id", userId);
  await service.auth.admin.deleteUser(userId);
}

beforeAll(async () => {
  tenantA = (
    await must(
      service
        .from("tenants")
        .select("id")
        .order("created_at")
        .limit(1)
        .single(),
      "initial tenant",
    )
  ).id;
  await must(
    service
      .from("tenants")
      .update({ custom_domain: A_HOST })
      .eq("id", tenantA)
      .select("id"),
    "tenant A host",
  );

  tenantB = await must(
    service.rpc("provision_tenant", {
      p_name: `Provisioned ${run}`,
      p_slug: SLUG,
      p_custom_domain: B_HOST,
      p_plan: "white_label",
      p_admin_email: adminEmail,
    }),
    "provision_tenant",
  );

  // The first admin signs in and the staged grant becomes their admin role
  // and membership, the way the auth callback does it.
  adminUserId = await createUser(adminEmail);
  admin = await signIn(adminEmail, "password123", { host: B_HOST });
  await must(admin.rpc("claim_pending_role_grants"), "claim");

  supportUserId = await createUser(supportEmail);
  memberUserId = await createUser(memberEmail);
  sharedUserId = await createUser(sharedEmail);
});

afterAll(async () => {
  await service
    .from("tenants")
    .update({ custom_domain: null })
    .eq("id", tenantA);
  const { data } = await service.from("tenants").select("id").eq("id", tenantB);
  if (data && data.length > 0) {
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", tenantB);
    await service.rpc("delete_tenant", { p_tenant_id: tenantB });
  }
  for (const userId of users) await deleteUser(userId);
});

describe("provisioning", () => {
  test("is refused to anyone but service_role", async () => {
    const { error } = await admin.rpc("provision_tenant", {
      p_name: "Nope",
      p_slug: `nope-${run}`,
    });
    expect(error).not.toBeNull();
  });

  test("seeds the five roles with the template's whole permission matrix", async () => {
    const roles = await must(
      service.from("roles").select("name").eq("tenant_id", tenantB),
      "roles",
    );
    expect(roles.map((r: { name: string }) => r.name).sort()).toEqual([
      "admin",
      "board",
      "event_coordinator",
      "finance",
      "volunteer",
    ]);

    const count = async (tenantId: string) => (
      await must(
        service
          .from("role_permissions")
          .select("id, roles!inner(name)", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("roles.name", [
            "admin",
            "board",
            "event_coordinator",
            "finance",
            "volunteer",
          ]),
        "matrix",
      ),
      (
        await service
          .from("role_permissions")
          .select("id, roles!inner(name)", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("roles.name", [
            "admin",
            "board",
            "event_coordinator",
            "finance",
            "volunteer",
          ])
      ).count
    );
    expect(await count(tenantB)).toBe(await count(tenantA));
    expect(await count(tenantB)).toBeGreaterThan(100);
  });

  test("copies the catalog defaults and the platform settings, not the template's site", async () => {
    const categories = async (tenantId: string) =>
      (
        await service
          .from("inventory_categories")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
      ).count;
    expect(await categories(tenantB)).toBe(await categories(tenantA));

    const templates = await must(
      service
        .from("agenda_templates")
        .select("key, current_version_id")
        .eq("tenant_id", tenantB),
      "agenda templates",
    );
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) expect(t.current_version_id).not.toBeNull();

    const settings = await must(
      service.from("app_settings").select("key").eq("tenant_id", tenantB),
      "settings",
    );
    const keys = settings.map((s: { key: string }) => s.key);
    expect(keys).toContain("finance.expense_approval_threshold");
    expect(keys).toContain("org.fiscal_year_start_month");
    expect(keys.some((k: string) => k.startsWith("site_images."))).toBe(false);
  });

  test("the staged admin lands in the new tenant with administration:manage", async () => {
    expect(await must(admin.rpc("current_tenant_id"), "current")).toBe(tenantB);
    const permissions = await must(admin.rpc("my_permissions"), "perms");
    expect(
      permissions.find(
        (p: { resource_key: string }) => p.resource_key === "administration",
      )?.level,
    ).toBe("manage");
    const grant = await must(
      service
        .from("pending_role_grants")
        .select("status")
        .eq("tenant_id", tenantB)
        .single(),
      "grant",
    );
    expect(grant.status).toBe("claimed");
  });
});

describe("support access", () => {
  let membershipId: string;
  let supportClient: SupabaseClient;
  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString();

  test("the tenant's admin grants it to an existing account, time-boxed", async () => {
    const { error: tooLong } = await admin.rpc("grant_support_access", {
      p_email: supportEmail,
      p_reason: "test",
      p_expires_at: inDays(120),
    });
    expect(tooLong?.message).toContain("SUPPORT_EXPIRY_TOO_FAR");

    const { error: unknown } = await admin.rpc("grant_support_access", {
      p_email: uniqueEmail("nobody"),
      p_reason: "test",
      p_expires_at: inDays(1),
    });
    expect(unknown?.message).toContain("SUPPORT_USER_NOT_FOUND");

    const { error: self } = await admin.rpc("grant_support_access", {
      p_email: adminEmail,
      p_reason: "test",
      p_expires_at: inDays(1),
    });
    expect(self?.message).toContain("SUPPORT_CANNOT_GRANT_SELF");

    membershipId = await must(
      admin.rpc("grant_support_access", {
        p_email: supportEmail,
        p_reason: "Phase 4 suite",
        p_expires_at: inDays(2),
      }),
      "grant",
    );
    const grants = await must(admin.rpc("list_support_grants"), "list");
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      id: membershipId,
      email: supportEmail,
      reason: "Phase 4 suite",
      roles: ["admin"],
      created_by_email: adminEmail,
    });
    // Support grants are not users of the organization.
    const portalUsers = await must(admin.rpc("list_portal_users"), "users");
    expect(portalUsers.map((u: { email: string }) => u.email)).not.toContain(
      supportEmail,
    );
  });

  test("the support account works inside the tenant but cannot mint or extend support", async () => {
    supportClient = await signIn(supportEmail);
    expect(await must(supportClient.rpc("current_tenant_id"), "current")).toBe(
      tenantB,
    );
    expect(await must(supportClient.rpc("is_admin"), "is_admin")).toBe(true);
    expect(
      await must(supportClient.rpc("current_membership_kind"), "kind"),
    ).toBe("support");

    const { error: grant } = await supportClient.rpc("grant_support_access", {
      p_email: memberEmail,
      p_reason: "escalate",
      p_expires_at: inDays(1),
    });
    expect(grant?.message).toContain("SUPPORT_CANNOT_GRANT_SUPPORT");
    const { error: revoke } = await supportClient.rpc("revoke_support_access", {
      p_membership_id: membershipId,
    });
    expect(revoke?.message).toContain("SUPPORT_CANNOT_REVOKE_SUPPORT");
    // Nor through the table.
    const { data: extended } = await supportClient
      .from("tenant_memberships")
      .update({ expires_at: inDays(80) })
      .eq("id", membershipId)
      .select("id");
    expect(extended).toEqual([]);
  });

  test("ending it removes the roles and the membership", async () => {
    await must(
      admin.rpc("revoke_support_access", { p_membership_id: membershipId }),
      "revoke",
    );
    expect(await must(admin.rpc("list_support_grants"), "list")).toEqual([]);
    const roles = await must(
      service
        .from("user_roles")
        .select("id")
        .eq("user_id", supportUserId)
        .eq("tenant_id", tenantB),
      "roles",
    );
    expect(roles).toEqual([]);
    expect(
      await must(supportClient.rpc("current_tenant_id"), "current after"),
    ).toBeNull();
  });
});

describe("membership and deactivation", () => {
  test("a member is removed from this tenant only; a shared account cannot be deactivated here", async () => {
    const adminRole = await must(
      service
        .from("roles")
        .select("id")
        .eq("tenant_id", tenantB)
        .eq("name", "volunteer")
        .single(),
      "role",
    );
    // Roles assigned by the tenant admin; ensure_membership_for_role joins.
    for (const userId of [memberUserId, sharedUserId]) {
      await must(
        admin
          .from("user_roles")
          .insert({ user_id: userId, role_id: adminRole.id })
          .select("id"),
        "assign",
      );
    }
    // The shared account also belongs to the seeded tenant.
    await must(
      service
        .from("tenant_memberships")
        .insert({ user_id: sharedUserId, tenant_id: tenantA, kind: "member" })
        .select("id"),
      "shared membership",
    );

    const listed = await must(admin.rpc("list_portal_users"), "users");
    const byEmail = Object.fromEntries(
      listed.map((u: { email: string; shared_account: boolean }) => [
        u.email,
        u.shared_account,
      ]),
    );
    expect(byEmail[memberEmail]).toBe(false);
    expect(byEmail[sharedEmail]).toBe(true);

    // Deactivation is platform-wide, so it is refused for the shared account
    // and allowed for the one this tenant alone is responsible for.
    const { error: refused } = await admin
      .from("deactivated_users")
      .insert({ user_id: sharedUserId, deactivated_by: adminUserId });
    expect(refused?.code).toBe("42501");
    await must(
      admin
        .from("deactivated_users")
        .insert({ user_id: memberUserId, deactivated_by: adminUserId })
        .select("user_id"),
      "deactivate",
    );
    await must(
      admin.from("deactivated_users").delete().eq("user_id", memberUserId),
      "reactivate",
    );

    const { error: self } = await admin.rpc("remove_tenant_member", {
      p_user_id: adminUserId,
    });
    expect(self?.message).toContain("CANNOT_REMOVE_SELF");
    await must(
      admin.rpc("remove_tenant_member", { p_user_id: sharedUserId }),
      "remove",
    );
    const memberships = await must(
      service
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", sharedUserId),
      "memberships",
    );
    expect(memberships).toEqual([{ tenant_id: tenantA }]);
  });
});

describe("site content and branding", () => {
  test("the public surface serves each tenant's own by host", async () => {
    await must(
      admin
        .from("site_content")
        .insert({ key: "home.heading", value: `Heading ${run}` })
        .select("id"),
      "content",
    );
    await must(
      admin
        .from("app_settings")
        .upsert(
          [
            { key: "brand.primary", value: "#123456" },
            { key: "brand.accent_stops", value: ["#111111", "#222222"] },
          ],
          { onConflict: "tenant_id,key" },
        )
        .select("id"),
      "branding",
    );

    const b = anonClient({ host: B_HOST });
    const a = anonClient({ host: A_HOST });

    expect(
      await must(
        b.from("public_tenant").select("name, slug").single(),
        "b tenant",
      ),
    ).toEqual({ name: `Provisioned ${run}`, slug: SLUG });
    expect(
      (await must(a.from("public_tenant").select("slug").single(), "a tenant"))
        .slug,
    ).not.toBe(SLUG);

    expect(
      await must(
        b.from("public_site_content").select("key, value"),
        "b content",
      ),
    ).toEqual([{ key: "home.heading", value: `Heading ${run}` }]);
    expect(
      await must(a.from("public_site_content").select("key"), "a content"),
    ).not.toContainEqual({ key: "home.heading" });

    const branding = await must(
      b.from("public_branding").select("token, value").order("token"),
      "b branding",
    );
    expect(branding).toEqual([
      { token: "accent_stops", value: ["#111111", "#222222"] },
      { token: "primary", value: "#123456" },
    ]);
    expect(
      await must(a.from("public_branding").select("token"), "a branding"),
    ).toEqual([]);
  });

  test("the tenant's own copy is invisible to another tenant's admin and to anon without a host", async () => {
    const seededAdmin = await signIn(SEEDED_USERS.admin);
    expect(
      await must(seededAdmin.from("site_content").select("key"), "a reads"),
    ).not.toContainEqual({ key: "home.heading" });
    // The site_content view for the seeded admin's session is A's.
    const { data } = await seededAdmin
      .from("site_content")
      .insert({ key: "home.intro", value: "A's intro" })
      .select("tenant_id")
      .single();
    expect(data?.tenant_id).toBe(tenantA);
    await service.from("site_content").delete().eq("tenant_id", tenantA);

    // Two active tenants and no host: nothing resolves.
    expect(
      await must(
        anonClient().from("public_site_content").select("key"),
        "no host",
      ),
    ).toEqual([]);
  });
});

describe("export and deletion", () => {
  test("the admin exports everything the tenant owns", async () => {
    const snapshot = await must(
      admin.rpc("export_current_tenant_data"),
      "export",
    );
    expect(snapshot.tenant.slug).toBe(SLUG);
    expect(snapshot.tables.site_content).toHaveLength(1);
    expect(snapshot.tables.roles).toHaveLength(5);
    expect(
      snapshot.memberships.map((m: { email: string }) => m.email),
    ).toContain(adminEmail);
    expect(Object.keys(snapshot.tables).length).toBeGreaterThan(70);
    expect(snapshot.audit_log.length).toBeGreaterThan(0);

    const volunteer = await signIn(SEEDED_USERS.volunteer);
    expect(
      await must(volunteer.rpc("export_current_tenant_data"), "non-admin"),
    ).toBeNull();
    const { error } = await admin.rpc("export_tenant_data", {
      p_tenant_id: tenantA,
    });
    expect(error).not.toBeNull();
  });

  test("deletion needs the tenant archived, then leaves only the accounts", async () => {
    const { error: active } = await service.rpc("delete_tenant", {
      p_tenant_id: tenantB,
    });
    expect(active?.message).toContain("TENANT_NOT_ARCHIVED");

    await must(
      service
        .from("tenants")
        .update({ status: "archived" })
        .eq("id", tenantB)
        .select("id"),
      "archive",
    );
    // Its host no longer reaches it. (With one active tenant left, the host
    // falls through to the sole-active-tenant fallback, which is the seeded
    // tenant -- the same thing an unknown host gets.)
    expect(
      await must(
        anonClient({ host: B_HOST }).from("public_tenant").select("id"),
        "archived host",
      ),
    ).not.toContainEqual({ id: tenantB });

    const result = await must(
      service.rpc("delete_tenant", { p_tenant_id: tenantB }),
      "delete",
    );
    expect(result.deleted.roles).toBe(5);
    expect(result.deleted.site_content).toBe(1);

    expect(
      await must(
        service.from("tenants").select("id").eq("id", tenantB),
        "tenant",
      ),
    ).toEqual([]);
    expect(
      await must(
        service
          .from("tenant_memberships")
          .select("id")
          .eq("tenant_id", tenantB),
        "memberships",
      ),
    ).toEqual([]);
    expect(
      await must(
        service.from("audit_log").select("id").eq("tenant_id", tenantB),
        "audit",
      ),
    ).toEqual([]);
    const { data: account } = await service.auth.admin.getUserById(adminUserId);
    expect(account.user?.email).toBe(adminEmail);
  });
});
