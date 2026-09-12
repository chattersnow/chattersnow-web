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
/** A role added to the template tenant, to prove provisioning copies it (#910). */
const TEMPLATE_CUSTOM_ROLE = `studio_manager_${run}`;

let tenantA: string;
let tenantB: string;
let templateCustomRoleId: string;
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

/** How many roles the template tenant holds, which is what a new tenant gets (#910). */
async function templateRoleCount(): Promise<number> {
  const { count } = await service
    .from("roles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantA);
  return count ?? 0;
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

  // #910: provisioning copies every role the template holds, not five by
  // name, so the template gets one of its own -- with a label, which is the
  // other half of what has to survive the copy.
  templateCustomRoleId = (
    await must(
      service
        .from("roles")
        .insert({
          tenant_id: tenantA,
          name: TEMPLATE_CUSTOM_ROLE,
          label: "Studio manager",
          description: "Added to the template for the provisioning test",
        })
        .select("id")
        .single(),
      "template custom role",
    )
  ).id;
  await must(
    service
      .from("role_permissions")
      .insert({
        role_id: templateCustomRoleId,
        resource_id: (
          await must(
            service.from("resources").select("id").eq("key", "events").single(),
            "events resource",
          )
        ).id,
        level: "manage",
      })
      .select("id"),
    "template custom role permission",
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
  await service.from("roles").delete().eq("id", templateCustomRoleId);
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

  // #910. It used to copy five roles by name and drop anything the template
  // had added itself, which is backwards now that the template tenant is where
  // the platform's defaults are curated: a role an operator adds there is a
  // default, and one they retire there is one a new tenant should not get.
  test("copies every role the template holds, labels and matrix included", async () => {
    const names = async (tenantId: string) =>
      (
        await must(
          service.from("roles").select("name").eq("tenant_id", tenantId),
          "roles",
        )
      )
        .map((r: { name: string }) => r.name)
        .sort();

    expect(await names(tenantB)).toEqual(await names(tenantA));
    expect(await names(tenantB)).toContain(TEMPLATE_CUSTOM_ROLE);

    const copied = await must(
      service
        .from("roles")
        .select("label, description")
        .eq("tenant_id", tenantB)
        .eq("name", TEMPLATE_CUSTOM_ROLE)
        .single(),
      "copied custom role",
    );
    expect(copied.label).toBe("Studio manager");

    const count = async (tenantId: string) =>
      (
        await service
          .from("role_permissions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
      ).count;
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

// #900. `programs` is the representative module: two resources, a table the
// tenant's admin can write through their own session, and an RPC gated on the
// second resource -- so one module exercises every layer the entitlement has
// to reach. The recipient resolver is covered where its fixtures already live,
// in src/lib/notifications/people-with-permission.integration.test.ts.
describe("module entitlements", () => {
  let programId: string;

  const setModule = async (moduleKey: string, enabled: boolean) =>
    service
      .from("tenant_modules")
      .update({ enabled })
      .eq("tenant_id", tenantB)
      .eq("module_key", moduleKey);

  const levelOf = async (resourceKey: string) => {
    const permissions = await must(admin.rpc("my_permissions"), "perms");
    return permissions.find(
      (p: { resource_key: string }) => p.resource_key === resourceKey,
    )?.level;
  };

  beforeAll(async () => {
    programId = (
      await must(
        admin
          .from("programs")
          .insert({ name: `Module Test ${run}` })
          .select("id")
          .single(),
        "program",
      )
    ).id;
  });

  test("provisioning seeds them from the plan, not from the template", async () => {
    const seeded = await must(
      service
        .from("tenant_modules")
        .select("module_key, enabled")
        .eq("tenant_id", tenantB)
        .order("module_key"),
      "tenant modules",
    );
    const planned = await must(
      service
        .from("plan_modules")
        .select("module_key, enabled")
        .eq("plan", "white_label")
        .order("module_key"),
      "plan modules",
    );
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded).toEqual(planned);
  });

  test("turning one off hides its resources, its rows and its RPCs", async () => {
    // On, to begin with: every assertion below is only worth making because
    // the same call answers the other way first.
    expect(await levelOf("programs")).toBe("manage");
    expect(
      (
        await must(
          admin.from("programs").select("id").eq("id", programId),
          "program visible",
        )
      ).length,
    ).toBe(1);
    await must(
      admin.rpc("get_program_impact_rollup_data", { p_program_id: programId }),
      "rollup allowed",
    );

    const { error: offError } = await setModule("programs", false);
    expect(offError).toBeNull();
    try {
      // my_permissions: `none` for every resource in the module, whatever the
      // matrix says -- and the admin's matrix still says manage.
      expect(await levelOf("programs")).toBe("none");
      expect(await levelOf("programs_reports")).toBe("none");
      expect(await levelOf("events")).toBe("manage");

      // Row-level security, which is the half a route guard could not give us.
      const { data: rows, error: readError } = await admin
        .from("programs")
        .select("id")
        .eq("id", programId);
      expect(readError).toBeNull();
      expect(rows).toEqual([]);

      // And the definer RPC behind the section's report.
      const { error: rpcError } = await admin.rpc(
        "get_program_impact_rollup_data",
        { p_program_id: programId },
      );
      expect(rpcError).not.toBeNull();

      // Off is hidden and frozen, never deleted: the row is still there for
      // service_role, so turning the module back on restores the history.
      const kept = await must(
        service.from("programs").select("id").eq("id", programId),
        "program kept",
      );
      expect(kept).toHaveLength(1);
    } finally {
      await setModule("programs", true);
    }

    expect(await levelOf("programs")).toBe("manage");
    expect(
      (
        await must(
          admin.from("programs").select("id").eq("id", programId),
          "program back",
        )
      ).length,
    ).toBe(1);
  });

  test("the tenant's own admin cannot write them", async () => {
    // The whole point of the ticket: an entitlement a customer can grant
    // themselves is a preference. There is no insert, update or delete policy
    // on tenant_modules and no write grant to go with one, so each of these
    // either refuses outright (42501) or matches nothing.
    const touchedNothing = (
      result: { error: { code?: string } | null; data: unknown },
      label: string,
    ) => {
      if (result.error) expect(result.error.code, label).toBe("42501");
      else expect(result.data, label).toEqual([]);
    };

    await must(setModule("programs", false), "off");
    try {
      touchedNothing(
        await admin
          .from("tenant_modules")
          .update({ enabled: true })
          .eq("tenant_id", tenantB)
          .eq("module_key", "programs")
          .select("module_key"),
        "update",
      );
      touchedNothing(
        await admin
          .from("tenant_modules")
          .delete()
          .eq("tenant_id", tenantB)
          .eq("module_key", "programs")
          .select("module_key"),
        "delete",
      );
      const { error: insertError } = await admin.from("tenant_modules").insert({
        tenant_id: tenantB,
        module_key: "inventory",
        enabled: true,
      });
      expect(insertError).not.toBeNull();

      // Still off, and still unreachable.
      expect(await levelOf("programs")).toBe("none");
    } finally {
      await setModule("programs", true);
    }
  });

  test("the tenant may read what it has been sold", async () => {
    const own = await must(
      admin.from("tenant_modules").select("module_key, enabled"),
      "own modules",
    );
    expect(own.length).toBeGreaterThan(0);
    const foreign = await must(
      admin
        .from("tenant_modules")
        .select("module_key")
        .eq("tenant_id", tenantA),
      "foreign modules",
    );
    expect(foreign).toEqual([]);
  });

  test("a core module cannot be disabled, even as service_role", async () => {
    // service_role bypasses row-level security, so the guard is a trigger.
    // The CLI and the seeds write as service_role; this is what stops one of
    // them leaving a tenant with no People screen and no way back in.
    for (const moduleKey of ["people", "administration"]) {
      const { error } = await setModule(moduleKey, false);
      expect(error?.message, moduleKey).toContain("MODULE_IS_CORE");
    }
    const core = await must(
      service
        .from("tenant_modules")
        .select("module_key, enabled")
        .eq("tenant_id", tenantB)
        .in("module_key", ["people", "administration"]),
      "core modules",
    );
    expect(core.every((m: { enabled: boolean }) => m.enabled)).toBe(true);
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
    // Two steps since #793: copy is staged as a draft and only reaches the
    // public views once it is published.
    await must(
      admin.rpc("save_site_content_drafts", {
        p_entries: [{ key: "home.heading", value: `Heading ${run}` }],
      }),
      "content draft",
    );
    await must(
      admin.rpc("publish_site_content", { p_keys: ["home.heading"] }),
      "content publish",
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
    // A owns a `home.heading` of its own since #795 rollout step 3, so the
    // claim is no longer "A has no such row" -- it is that A's row is A's.
    // Asserting on the value is what actually tests the isolation; asserting
    // on the key only ever tested that the seed was empty.
    expect(
      await must(
        a.from("public_site_content").select("key, value"),
        "a content",
      ),
    ).not.toContainEqual({ key: "home.heading", value: `Heading ${run}` });

    const branding = await must(
      b.from("public_branding").select("token, value").order("token"),
      "b branding",
    );
    expect(branding).toEqual([
      { token: "accent_stops", value: ["#111111", "#222222"] },
      { token: "primary", value: "#123456" },
    ]);
    // A has branding of its own since #795 rollout step 3, so "A has none" is
    // no longer the claim -- what must not cross is B's. Asserting on the
    // values is the isolation; asserting the list was empty only ever tested
    // that the seed had no palette.
    expect(
      await must(
        a.from("public_branding").select("token, value"),
        "a branding",
      ),
    ).not.toContainEqual({ token: "primary", value: "#123456" });
  });

  test("the tenant's own copy is invisible to another tenant's admin and to anon without a host", async () => {
    const seededAdmin = await signIn(SEEDED_USERS.admin);
    // Same as above: A's admin does see a `home.heading` -- its own. What must
    // not appear is B's row, so the assertion is on the tenant every visible
    // row belongs to, which is the isolation claim stated directly.
    const visible = await must(
      seededAdmin.from("site_content").select("tenant_id"),
      "a reads",
    );
    expect(
      (visible as { tenant_id: string }[]).every(
        (r) => r.tenant_id === tenantA,
      ),
    ).toBe(true);
    // The site_content view for the seeded admin's session is A's: the draft
    // RPC stamps the caller's own tenant, never the one being read by host.
    await must(
      seededAdmin.rpc("save_site_content_drafts", {
        p_entries: [{ key: "home.intro", value: "A's intro" }],
      }),
      "a intro",
    );
    const { data } = await seededAdmin
      .from("site_content")
      .select("tenant_id")
      .eq("key", "home.intro")
      .single();
    expect(data?.tenant_id).toBe(tenantA);
    // Clear the draft rather than delete the row: `home.intro` is one of the
    // slots A owns since #795 rollout step 3, so deleting A's site_content
    // here would take its published copy with it.
    await service
      .from("site_content")
      .update({ has_draft: false, draft_value: null })
      .eq("tenant_id", tenantA)
      .eq("key", "home.intro");

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
    expect(snapshot.tables.roles).toHaveLength(await templateRoleCount());
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
    expect(result.deleted.roles).toBe(await templateRoleCount());
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
