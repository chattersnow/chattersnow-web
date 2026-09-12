// #707 Phase 5c against a real local stack.
//
// The platform RPCs are the only privileged path in a schema that deliberately
// has no super-admin, so what this file is really testing is that the gate is
// three conditions rather than one. The interesting cases are the refusals:
//
//   * a customer's admin who has granted themselves `platform_tenants` in
//     their own matrix -- which they can, they own their matrix -- and is
//     still refused, because they are not in the internal tenant;
//   * a member of the internal tenant without the resource;
//   * a *support* member of the internal tenant, who holds the admin role
//     there but must not inherit the platform with it.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  serviceRoleClient,
  signIn,
  uniqueEmail,
} from "@/../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const SLUG = `plat-${run}`;
const B_HOST = `plat-${run}.example.test`;

let tenantA: string;
let tenantB: string;
let seededAdmin: SupabaseClient;
let bAdmin: SupabaseClient;
let internalSupport: SupabaseClient;
let platformResourceId: string;

const bAdminEmail = uniqueEmail("plat-b-admin");
const supportEmail = uniqueEmail("plat-support");
const users: string[] = [];

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

beforeAll(async () => {
  tenantA = (
    await must(
      service
        .from("tenants")
        .select("id")
        .order("created_at")
        .limit(1)
        .single(),
      "seeded tenant",
    )
  ).id as string;

  seededAdmin = await signIn(SEEDED_USERS.admin);

  tenantB = await must(
    service.rpc("provision_tenant", {
      p_name: `Platform probe ${run}`,
      p_slug: SLUG,
      p_custom_domain: B_HOST,
      p_plan: "white_label",
      p_admin_email: bAdminEmail,
    }),
    "provision_tenant",
  );

  await createUser(bAdminEmail);
  bAdmin = await signIn(bAdminEmail, "password123", { host: B_HOST });
  await must(bAdmin.rpc("claim_pending_role_grants"), "claim");

  // The sharp case: give tenant B's admin role the platform resource in its
  // own tenant. A tenant admin can do exactly this from Administration >
  // Permissions, so the test has to assume they will.
  const bAdminRole = await must(
    service
      .from("roles")
      .select("id")
      .eq("tenant_id", tenantB)
      .eq("name", "admin")
      .single(),
    "B admin role",
  );
  platformResourceId = (
    await must(
      service
        .from("resources")
        .select("id")
        .eq("key", "platform_tenants")
        .single(),
      "platform resource",
    )
  ).id as string;
  await must(
    service
      .from("role_permissions")
      .upsert(
        {
          role_id: bAdminRole.id,
          resource_id: platformResourceId,
          level: "manage",
        },
        { onConflict: "role_id,resource_id" },
      )
      .select("id"),
    "grant platform to B",
  );

  // A support grant into the *internal* tenant, issued by its own admin the
  // way Phase 4 requires.
  const supportUserId = await createUser(supportEmail);
  await must(
    seededAdmin.rpc("grant_support_access", {
      p_email: supportEmail,
      p_reason: `Phase 5c probe ${run}`,
      p_expires_at: new Date(Date.now() + 86400000).toISOString(),
      p_role_name: "admin",
    }),
    "support grant",
  );
  internalSupport = await signIn(supportEmail);
  expect(supportUserId).toBeTruthy();
});

afterAll(async () => {
  const { data } = await service.from("tenants").select("id").eq("id", tenantB);
  if (data && data.length > 0) {
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", tenantB);
    await service.rpc("delete_tenant", { p_tenant_id: tenantB });
  }
  await service
    .from("tenant_memberships")
    .delete()
    .eq("tenant_id", tenantA)
    .eq("kind", "support");
  for (const userId of users) {
    await service
      .from("audit_log")
      .update({ actor_id: null })
      .eq("actor_id", userId);
    await service.from("user_roles").delete().eq("user_id", userId);
    await service.from("tenant_memberships").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
});

describe("the gate", () => {
  test("the platform's own admin holds it", async () => {
    expect(
      await must(seededAdmin.rpc("is_platform_operator"), "operator"),
    ).toBe(true);
  });

  test("a customer's admin does not, even holding the resource", async () => {
    // They really do hold it -- beforeAll granted it to their role the way
    // Administration > Permissions would, and the row is still there. This is
    // not a test of the permission check.
    const granted = await must(
      service
        .from("role_permissions")
        .select("level, roles!inner(tenant_id, name)")
        .eq("roles.tenant_id", tenantB)
        .eq("roles.name", "admin")
        .eq("resource_id", platformResourceId)
        .single(),
      "B raw grant",
    );
    expect(granted.level).toBe("manage");

    expect(await must(bAdmin.rpc("is_platform_operator"), "B operator")).toBe(
      false,
    );
  });

  // #795: the grant above is inert, but my_permissions() used to report it
  // anyway, and the nav is built from my_permissions(). So a customer's admin
  // got an Administration > Platform entry that rendered "Could not load
  // tenants" -- which is exactly what Chatter Snow's own admins saw the moment
  // it moved to the white_label plan.
  test("and my_permissions() does not offer it to them", async () => {
    const permissions = await must(bAdmin.rpc("my_permissions"), "B perms");
    expect(
      permissions.find(
        (p: { resource_key: string }) => p.resource_key === "platform_tenants",
      )?.level,
    ).toBe("none");
  });

  test("my_permissions() still offers it to the platform's own admin", async () => {
    const permissions = await must(
      seededAdmin.rpc("my_permissions"),
      "seeded perms",
    );
    expect(
      permissions.find(
        (p: { resource_key: string }) => p.resource_key === "platform_tenants",
      )?.level,
    ).toBe("manage");
  });

  test("nor to a support member of the platform tenant", async () => {
    const permissions = await must(
      internalSupport.rpc("my_permissions"),
      "support perms",
    );
    expect(
      permissions.find(
        (p: { resource_key: string }) => p.resource_key === "platform_tenants",
      )?.level,
    ).toBe("none");
  });

  test("a support member of the platform tenant does not", async () => {
    expect(
      await must(internalSupport.rpc("current_membership_kind"), "kind"),
    ).toBe("support");
    expect(
      await must(
        internalSupport.rpc("is_platform_operator"),
        "support operator",
      ),
    ).toBe(false);
  });

  test("a member of the platform tenant without the resource does not", async () => {
    const finance = await signIn(SEEDED_USERS.finance);
    expect(
      await must(finance.rpc("is_platform_operator"), "finance operator"),
    ).toBe(false);
  });
});

describe("every platform RPC refuses everyone but the operator", () => {
  const callers = () =>
    [
      ["a customer's admin", bAdmin],
      ["a support member of the platform tenant", internalSupport],
    ] as const;

  test("platform_list_tenants", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_list_tenants");
      expect(error?.message, who).toContain("Not authorized");
    }
  });

  test("platform_provision_tenant", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_provision_tenant", {
        p_name: "Nope",
        p_slug: `nope-${run}`,
      });
      expect(error?.message, who).toContain("Not authorized");
    }
    // and nothing was created
    const { data } = await service
      .from("tenants")
      .select("id")
      .eq("slug", `nope-${run}`);
    expect(data ?? []).toHaveLength(0);
  });

  test("platform_set_tenant_domain", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_set_tenant_domain", {
        p_tenant_id: tenantA,
        p_custom_domain: "stolen.example.test",
      });
      expect(error?.message, who).toContain("Not authorized");
    }
    const tenant = await must(
      service
        .from("tenants")
        .select("custom_domain")
        .eq("id", tenantA)
        .single(),
      "A domain",
    );
    expect(tenant.custom_domain).not.toBe("stolen.example.test");
  });

  test("platform_set_tenant_status", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_set_tenant_status", {
        p_tenant_id: tenantA,
        p_status: "archived",
      });
      expect(error?.message, who).toContain("Not authorized");
    }
    const tenant = await must(
      service.from("tenants").select("status").eq("id", tenantA).single(),
      "A status",
    );
    expect(tenant.status).toBe("active");
  });

  test("platform_export_tenant", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_export_tenant", {
        p_tenant_id: tenantA,
      });
      expect(error?.message, who).toContain("Not authorized");
    }
  });

  test("platform_list_tenant_modules", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_list_tenant_modules", {
        p_tenant_id: tenantB,
      });
      expect(error?.message, who).toContain("Not authorized");
    }
  });

  test("platform_set_tenant_module", async () => {
    for (const [who, client] of callers()) {
      const { error } = await client.rpc("platform_set_tenant_module", {
        p_tenant_id: tenantB,
        p_module_key: "finance",
        p_enabled: false,
      });
      expect(error?.message, who).toContain("Not authorized");
    }
    // A customer's admin turning their *own* module off is the case this
    // matters most for: they hold the resource in their own matrix, and the
    // entitlement is not theirs to write.
    const rows = await must(
      service
        .from("tenant_modules")
        .select("enabled")
        .eq("tenant_id", tenantB)
        .eq("module_key", "finance"),
      "B finance after refusals",
    );
    expect(rows[0]?.enabled).toBe(true);
  });
});

describe("what the operator can do", () => {
  test("lists every tenant with its metadata and open support grants", async () => {
    const tenants = await must(
      seededAdmin.rpc("platform_list_tenants"),
      "list",
    );
    const b = tenants.find((t: { id: string }) => t.id === tenantB);
    expect(b.slug).toBe(SLUG);
    expect(b.custom_domain).toBe(B_HOST);
    expect(b.plan).toBe("white_label");

    // The support grant this file opened in the internal tenant shows there,
    // read-only -- the operator can see who is in without letting themselves in.
    const a = tenants.find((t: { id: string }) => t.id === tenantA);
    expect(a.support_grant_count).toBeGreaterThan(0);
    expect(a.member_count).toBeGreaterThan(0);
  });

  test("sets a domain and a status", async () => {
    const moved = `moved-${run}.example.test`;
    await must(
      seededAdmin.rpc("platform_set_tenant_domain", {
        p_tenant_id: tenantB,
        p_custom_domain: moved.toUpperCase(),
      }),
      "set domain",
    );
    let tenant = await must(
      service
        .from("tenants")
        .select("custom_domain, status")
        .eq("id", tenantB)
        .single(),
      "B after domain",
    );
    // Lowercased for the caller: the check constraint refuses anything else,
    // and a constraint violation is a worse answer than just doing it.
    expect(tenant.custom_domain).toBe(moved);

    await must(
      seededAdmin.rpc("platform_set_tenant_status", {
        p_tenant_id: tenantB,
        p_status: "suspended",
      }),
      "suspend",
    );
    tenant = await must(
      service.from("tenants").select("status").eq("id", tenantB).single(),
      "B after status",
    );
    expect(tenant.status).toBe("suspended");

    await must(
      seededAdmin.rpc("platform_set_tenant_status", {
        p_tenant_id: tenantB,
        p_status: "active",
      }),
      "reactivate",
    );
  });

  test("cannot suspend or archive the platform tenant itself", async () => {
    // There is no second door: platform access is a membership in this tenant,
    // so taking it off the air takes this page with it.
    const { error } = await seededAdmin.rpc("platform_set_tenant_status", {
      p_tenant_id: tenantA,
      p_status: "suspended",
    });
    expect(error?.message).toContain("cannot be suspended or archived");
  });

  test("rejects an unknown status and an unknown tenant", async () => {
    const bad = await seededAdmin.rpc("platform_set_tenant_status", {
      p_tenant_id: tenantB,
      p_status: "deleted",
    });
    expect(bad.error?.message).toContain("Unknown tenant status");

    const missing = await seededAdmin.rpc("platform_set_tenant_domain", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_custom_domain: "nowhere.example.test",
    });
    expect(missing.error?.message).toContain("No such tenant");
  });

  test("exports a tenant it is not a member of", async () => {
    const snapshot = await must(
      seededAdmin.rpc("platform_export_tenant", { p_tenant_id: tenantB }),
      "export B",
    );
    expect(snapshot.tenant.slug).toBe(SLUG);
    expect(Object.keys(snapshot.tables ?? {}).length).toBeGreaterThan(0);
  });

  test("provisioning through the wrapper produces a working tenant", async () => {
    const slug = `plat-wrapped-${run}`;
    const id = await must(
      seededAdmin.rpc("platform_provision_tenant", {
        p_name: "Wrapped",
        p_slug: slug,
        p_custom_domain: null,
        p_plan: "white_label",
        p_admin_email: null,
      }),
      "provision through wrapper",
    );

    const roles = await must(
      service.from("roles").select("name").eq("tenant_id", id),
      "wrapped roles",
    );
    expect(roles.length).toBeGreaterThanOrEqual(5);

    await service.from("tenants").update({ status: "archived" }).eq("id", id);
    await must(service.rpc("delete_tenant", { p_tenant_id: id }), "cleanup");
  });
});

describe("provisioning does not mint a link to an existing account (#759)", () => {
  test("an address that already has an account gets a tenant but no link", async () => {
    // The takeover primitive, and this page is what would make it reachable
    // from a browser rather than a shell. They sign in with the account they
    // have; claim_pending_role_grants() is what gives them the new tenant.
    const existing = uniqueEmail("plat-existing");
    await createUser(existing);

    const slug = `plat-existing-${run}`;
    const id = await must(
      seededAdmin.rpc("platform_provision_tenant", {
        p_name: "Has An Account",
        p_slug: slug,
        p_admin_email: existing,
      }),
      "provision for an existing account",
    );

    // The grant is staged either way -- that is what makes the link
    // unnecessary rather than merely withheld.
    const staged = await must(
      service.from("pending_role_grants").select("email").eq("tenant_id", id),
      "staged grant",
    );
    expect(staged.map((g: { email: string }) => g.email)).toContain(existing);

    // An account with no membership anywhere is still somebody's account --
    // signed in once, waiting on a grant -- so a link to it is a session as
    // them. That is the case this check exists for, as much as the
    // belongs-to-another-organization one.
    expect(
      await must(
        seededAdmin.rpc("email_is_this_tenants_to_invite", {
          p_email: existing,
        }),
        "claimable check",
      ),
    ).toBe(false);

    await service.from("tenants").update({ status: "archived" }).eq("id", id);
    await must(service.rpc("delete_tenant", { p_tenant_id: id }), "cleanup");
  });
});

// #901. The entitlements themselves are #900's; this is the operator's way to
// set them, and the interesting part is the same as everywhere else on this
// page -- what it refuses.
describe("module entitlements", () => {
  const modulesOf = async (tenantId: string) =>
    (await must(
      seededAdmin.rpc("platform_list_tenant_modules", {
        p_tenant_id: tenantId,
      }),
      "list modules",
    )) as {
      module_key: string;
      is_core: boolean;
      enabled: boolean;
      source: string;
      updated_by_email: string | null;
    }[];

  const moduleRow = async (tenantId: string, key: string) =>
    (await modulesOf(tenantId)).find((m) => m.module_key === key)!;

  test("lists the whole catalog, in order, with the core ones marked", async () => {
    const modules = await modulesOf(tenantB);
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.map((m) => m.module_key)).toContain("finance");
    expect(modules.filter((m) => m.is_core).map((m) => m.module_key)).toEqual([
      "people",
      "administration",
    ]);
  });

  test("reports where each value comes from, before and after a set", async () => {
    // Provisioning seeded tenant_modules from plan_modules, so every row is
    // already an explicit tenant setting. Removing one is how a tenant that
    // predates #900 looks -- and the fallback is what the page must describe
    // honestly rather than showing as a decision somebody took.
    await must(
      service
        .from("tenant_modules")
        .delete()
        .eq("tenant_id", tenantB)
        .eq("module_key", "governance")
        .select("module_key"),
      "drop governance row",
    );
    let governance = await moduleRow(tenantB, "governance");
    expect(governance.source).toBe("plan");
    expect(governance.enabled).toBe(true);
    expect(governance.updated_by_email).toBeNull();

    await must(
      seededAdmin.rpc("platform_set_tenant_module", {
        p_tenant_id: tenantB,
        p_module_key: "governance",
        p_enabled: false,
      }),
      "disable governance",
    );
    governance = await moduleRow(tenantB, "governance");
    expect(governance.source).toBe("tenant");
    expect(governance.enabled).toBe(false);
    // Stamped with the operator who did it, which is the other half of the
    // question this page answers.
    expect(governance.updated_by_email).toBe(SEEDED_USERS.admin);
  });

  test("the tenant's own admin loses the section, and gets it back", async () => {
    await must(
      seededAdmin.rpc("platform_set_tenant_module", {
        p_tenant_id: tenantB,
        p_module_key: "inventory",
        p_enabled: false,
      }),
      "disable inventory",
    );

    const off = await must(bAdmin.rpc("my_permissions"), "B perms off");
    expect(
      off.find((p: { resource_key: string }) => p.resource_key === "inventory")
        ?.level,
    ).toBe("none");

    await must(
      seededAdmin.rpc("platform_set_tenant_module", {
        p_tenant_id: tenantB,
        p_module_key: "inventory",
        p_enabled: true,
      }),
      "re-enable inventory",
    );
    const on = await must(bAdmin.rpc("my_permissions"), "B perms on");
    expect(
      on.find((p: { resource_key: string }) => p.resource_key === "inventory")
        ?.level,
    ).toBe("manage");
  });

  test("refuses a core module, an unknown one, and a tenant that is not there", async () => {
    const core = await seededAdmin.rpc("platform_set_tenant_module", {
      p_tenant_id: tenantB,
      p_module_key: "people",
      p_enabled: false,
    });
    expect(core.error?.message).toContain("core");

    const unknown = await seededAdmin.rpc("platform_set_tenant_module", {
      p_tenant_id: tenantB,
      p_module_key: "not_a_module",
      p_enabled: true,
    });
    expect(unknown.error?.message).toContain("Unknown module");

    const missing = await seededAdmin.rpc("platform_set_tenant_module", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_module_key: "finance",
      p_enabled: false,
    });
    expect(missing.error?.message).toContain("No such tenant");

    const missingList = await seededAdmin.rpc("platform_list_tenant_modules", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(missingList.error?.message).toContain("No such tenant");

    // Enabling a core module is a no-op rather than a refusal: it is already
    // on, and an operator who clicks it should not be told off.
    await must(
      seededAdmin.rpc("platform_set_tenant_module", {
        p_tenant_id: tenantB,
        p_module_key: "people",
        p_enabled: true,
      }),
      "enable a core module",
    );
  });

  test("cannot turn a module off on the platform's own tenant", async () => {
    // Same reasoning as refusing to archive it: platform administration is a
    // membership inside this tenant, so taking a section off here is this page
    // removing its own controls, with no super-admin to put them back.
    const { error } = await seededAdmin.rpc("platform_set_tenant_module", {
      p_tenant_id: tenantA,
      p_module_key: "finance",
      p_enabled: false,
    });
    expect(error?.message).toContain("platform tenant");

    const still = await moduleRow(tenantA, "finance");
    expect(still.enabled).toBe(true);
  });

  test("every write is in the audit log", async () => {
    // "Who turned Finance off for this customer and when" is the question this
    // page gets asked later, and audit_log.record_id is the tenant because
    // tenant_modules has no surrogate id to be.
    const rows = await must(
      service
        .from("audit_log")
        .select("action, old_data, new_data")
        .eq("table_name", "tenant_modules")
        .eq("record_id", tenantB)
        .order("occurred_at", { ascending: false })
        .limit(20),
      "module audit rows",
    );
    const governance = rows.find(
      (r: { new_data: { module_key?: string } | null }) =>
        r.new_data?.module_key === "governance",
    );
    expect(governance).toBeDefined();
    expect(governance.new_data.enabled).toBe(false);
  });
});

describe("the catalog", () => {
  test("adding the platform resource left no isolation gap", async () => {
    const gaps = await must(seededAdmin.rpc("tenant_isolation_gaps"), "gaps");
    expect(gaps).toEqual([]);
  });
});

describe("the starter vocabulary a tenant is provisioned with (#976)", () => {
  // The rows, not the code. #838 swept `src/**`; what provision_tenant()
  // copies out of the template tenant is data, so nothing in that sweep could
  // have caught "Chatter Snow board meeting agenda" sitting in a fresh
  // customer's governance module. tenantB is provisioned in beforeAll exactly
  // the way a real customer is, which makes it the right subject.
  const namesAnotherOrg = (text: string | null | undefined) =>
    typeof text === "string" && /chatter/i.test(text);

  test("no agenda template names another organization", async () => {
    const rows = await must(
      service
        .from("agenda_templates")
        .select("key, name, description")
        .eq("tenant_id", tenantB),
      "provisioned agenda templates",
    );
    expect(rows.length).toBeGreaterThan(0);
    const offenders = rows.filter(
      (r: { name: string; description: string | null }) =>
        namesAnotherOrg(r.name) || namesAnotherOrg(r.description),
    );
    expect(offenders).toEqual([]);
  });

  test("no brief template or field label names another organization", async () => {
    const rows = await must(
      service
        .from("content_brief_templates")
        .select("key, name, description, current_version_id")
        .eq("tenant_id", tenantB),
      "provisioned brief templates",
    );
    expect(rows.length).toBeGreaterThan(0);

    const versions = await must(
      service
        .from("content_brief_template_versions")
        .select("fields")
        .eq("tenant_id", tenantB),
      "provisioned brief template versions",
    );
    expect(versions.length).toBeGreaterThan(0);

    const offenders = rows.filter(
      (r: { name: string; description: string | null }) =>
        namesAnotherOrg(r.name) || namesAnotherOrg(r.description),
    );
    expect(offenders).toEqual([]);

    // Labels only: `why_chatter_matters` is the key a filled-in brief's
    // answers are stored against and is never displayed, so it stays.
    const labels = versions.flatMap((v: { fields: { label?: string }[] }) =>
      (v.fields ?? []).map((f) => f.label),
    );
    expect(
      labels.filter((l: string | undefined) => namesAnotherOrg(l)),
    ).toEqual([]);
  });
});
