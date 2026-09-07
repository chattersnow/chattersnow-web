// The cross-tenant isolation suite for #707 Phase 3, against a real local
// Supabase stack.
//
// Two tenants exist for the whole file: the seeded Chatter Snow tenant (A,
// with all the seed data) and a second tenant (B) created here with its own
// admin, a platform-support grant, a custom domain and a handful of rows.
// For every tenant table the suite asserts that a session in one tenant can
// neither read, update nor delete the other's rows, then checks the things
// row-level security alone does not cover: the security definer RPCs, the
// composite foreign keys, the host-resolved public surface, and the catalog
// itself (every policy carries the tenant predicate, every foreign key
// between tenant tables is composite).
//
// Platform access is a `support` membership rather than a bypass, so the
// support session runs the same per-table checks as the ordinary admin.
//
// Tables the seed leaves empty get a fixture row in tenant A first, so no
// per-table assertion is vacuous. Everything created here is removed in
// afterAll; a leftover active tenant would make the public site and every
// later sessionless test resolve nothing.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";
import {
  SEEDED_EVENT_IDS,
  SEEDED_PERSON_IDS,
  SEEDED_USER_IDS,
} from "../../../test/seed-fixtures";
import { TENANT_TABLES } from "../../../test/tenant-tables";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const A_HOST = `a-${run}.example.test`;
const B_HOST = `b-${run}.example.test`;

let tenantA: string;
let tenantB: string;
let bAdminRoleId: string;
let bAdminUserId: string;
let bSupportUserId: string;
let bAdmin: SupabaseClient;
let bSupport: SupabaseClient;

// Rows in A the seed does not provide, with the columns that identify them,
// for cleanup.
let aRetentionRunId: string;

const aFixtures: Array<{
  table: string;
  match: Record<string, unknown>;
  via: SupabaseClient;
}> = [];
// Ids in A the RPC checks point at.
const a = {
  giveawayId: "babababa-0000-4000-8000-000000000002",
  expenseId: "",
  programId: "",
  inventoryItemId: "",
};
// Rows in B.
const b = {
  programId: "",
  personId: "",
  eventId: "",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must<T = any>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

async function createTenantUser(email: string) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function deleteTenantUser(userId: string) {
  // audit_log.actor_id references auth.users without a cascade.
  await service
    .from("audit_log")
    .update({ actor_id: null })
    .eq("actor_id", userId);
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw error;
}

beforeAll(async () => {
  const initial = await must(
    service.from("tenants").select("id").order("created_at").limit(1).single(),
    "initial tenant",
  );
  tenantA = initial.id as string;

  // A gets a host of its own for the duration, so the public surface can be
  // asked for either tenant by host rather than by "the only one".
  await must(
    service
      .from("tenants")
      .update({ custom_domain: A_HOST })
      .eq("id", tenantA)
      .select("id")
      .single(),
    "tenant A domain",
  );

  const created = await must(
    service
      .from("tenants")
      .insert({
        name: "Isolation Test Org",
        slug: `isolation-${run}`,
        custom_domain: B_HOST,
        plan: "white_label",
      })
      .select("id")
      .single(),
    "tenant B",
  );
  tenantB = created.id as string;

  // An admin role in B with manage on every resource -- the same reach the
  // seeded admin has in A, so nothing below fails for lack of permission.
  const role = await must(
    service
      .from("roles")
      .insert({ tenant_id: tenantB, name: "admin", description: "test" })
      .select("id")
      .single(),
    "role",
  );
  bAdminRoleId = role.id as string;
  const resources = await must(
    service.from("resources").select("id"),
    "resources",
  );
  await must(
    service
      .from("role_permissions")
      .insert(
        resources.map((r: { id: string }) => ({
          role_id: bAdminRoleId,
          resource_id: r.id,
          level: "manage",
        })),
      )
      .select("id"),
    "role_permissions",
  );

  bAdminUserId = await createTenantUser(uniqueEmail("b-admin"));
  // ensure_membership_for_role creates the member row.
  await must(
    service
      .from("user_roles")
      .insert({ user_id: bAdminUserId, role_id: bAdminRoleId })
      .select("id"),
    "b admin role",
  );

  // Platform staff: a time-boxed support membership holding the same role.
  // The membership goes in first so the role trigger's `on conflict do
  // nothing` leaves it a support row.
  bSupportUserId = await createTenantUser(uniqueEmail("b-support"));
  await must(
    service
      .from("tenant_memberships")
      .insert({
        user_id: bSupportUserId,
        tenant_id: tenantB,
        kind: "support",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: "isolation suite",
      })
      .select("id"),
    "support membership",
  );
  await must(
    service
      .from("user_roles")
      .insert({ user_id: bSupportUserId, role_id: bAdminRoleId })
      .select("id"),
    "b support role",
  );

  const [bAdminEmail, bSupportEmail] = await Promise.all([
    service.auth.admin.getUserById(bAdminUserId),
    service.auth.admin.getUserById(bSupportUserId),
  ]);
  bAdmin = await signIn(bAdminEmail.data.user!.email!);
  bSupport = await signIn(bSupportEmail.data.user!.email!);

  // B's rows, written through B's own admin session and the column default.
  b.programId = (
    await must(
      bAdmin
        .from("programs")
        .insert({ name: `Isolation ${run}` })
        .select("id")
        .single(),
      "b program",
    )
  ).id as string;
  b.personId = (
    await must(
      bAdmin
        .from("people")
        .insert({
          name: "Isolation Person",
          source_type: "other",
          email: uniqueEmail("b-person"),
        })
        .select("id")
        .single(),
      "b person",
    )
  ).id as string;
  b.eventId = (
    await must(
      bAdmin
        .from("events")
        .insert({
          name: `Isolation Event ${run}`,
          starts_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          timezone: "America/Chicago",
          visibility: "public",
          status: "published",
          registration_enabled: true,
        })
        .select("id")
        .single(),
      "b event",
    )
  ).id as string;
  await must(
    bAdmin
      .from("event_registrations")
      .insert({
        event_id: b.eventId,
        name: "Isolation Registrant",
        email: uniqueEmail("b-registrant"),
      })
      .select("id"),
    "b registration",
  );
  await must(
    bAdmin
      .from("event_expenses")
      .insert({
        description: "Isolation expense",
        amount: 12.5,
        submitted_by: bAdminUserId,
        status: "submitted",
      })
      .select("id"),
    "b expense",
  );

  // A's ids the RPC checks use.
  a.expenseId = (
    await must(
      service
        .from("event_expenses")
        .select("id")
        .eq("tenant_id", tenantA)
        .eq("status", "submitted")
        .limit(1)
        .single(),
      "a expense",
    )
  ).id as string;
  a.programId = (
    await must(
      service
        .from("programs")
        .select("id")
        .eq("tenant_id", tenantA)
        .limit(1)
        .single(),
      "a program",
    )
  ).id as string;
  a.inventoryItemId = (
    await must(
      service
        .from("inventory_items")
        .select("id")
        .eq("tenant_id", tenantA)
        .eq("status", "available")
        .limit(1)
        .single(),
      "a inventory item",
    )
  ).id as string;

  // Fixture rows in A for the tables the seed leaves empty, through the
  // seeded admin so they take the same path the app does.
  const fixture = async (
    table: string,
    row: Record<string, unknown>,
    via: SupabaseClient = adminClient,
  ) => {
    const inserted = await must(
      via.from(table).insert(row).select("*").single(),
      `fixture ${table}`,
    );
    const match = "id" in inserted ? { id: inserted.id } : row;
    aFixtures.push({ table, match, via });
    return inserted.id as string;
  };

  await fixture("bylaws", {
    version: `iso-${run}`,
    effective_date: "2030-01-01",
  });
  await fixture("policies", {
    name: `Isolation policy ${run}`,
    effective_date: "2030-01-01",
    version: "1",
  });
  await fixture("grants", {
    funder_name: `Isolation funder ${run}`,
    application_deadline: "2030-01-01",
  });
  await fixture("site_content", {
    key: "home.heading",
    value: `Isolation heading ${run}`,
  });
  await fixture("event_incidents", {
    event_id: SEEDED_EVENT_IDS.past,
    description: "Isolation incident",
  });
  await fixture("person_organizations", {
    organization_id: SEEDED_PERSON_IDS.sponsor,
    person_id: SEEDED_PERSON_IDS.volunteer,
  });
  await fixture("conflict_of_interest_disclosures", {
    person_id: SEEDED_PERSON_IDS.volunteer,
    disclosure_year: 2031,
  });
  const calendarItems = await must(
    service
      .from("calendar_items")
      .select("id")
      .eq("tenant_id", tenantA)
      .limit(2),
    "a calendar items",
  );
  await fixture("calendar_item_links", {
    item_id: calendarItems[0].id,
    related_item_id: calendarItems[1].id,
  });
  await fixture("calendar_program_suggestion_rules", {
    program_id: a.programId,
    item_type: "chatter_event",
    category: "chatter_events",
  });
  const opportunity = await must(
    service
      .from("content_opportunities")
      .select("id")
      .eq("tenant_id", tenantA)
      .limit(1)
      .single(),
    "a content opportunity",
  );
  await fixture("content_permissions", {
    content_opportunity_id: opportunity.id,
    permitted_use: "isolation suite",
    consent_on_file_at: "2030-01-01",
  });
  await fixture(
    "person_merges",
    {
      tenant_id: tenantA,
      survivor_person_id: SEEDED_PERSON_IDS.volunteer,
      merged_person_id: crypto.randomUUID(),
      merged_snapshot: {},
      survivor_before: {},
      repointed: {},
    },
    service,
  );

  // Giveaway tiers, grants, rules, a bucket, a package and a sale on A's
  // past-event giveaway; seed_giveaway_tiers is a no-op if tiers exist.
  await must(
    adminClient.rpc("seed_giveaway_tiers", { p_giveaway_id: a.giveawayId }),
    "seed tiers",
  );
  const tier = await must(
    service
      .from("giveaway_tiers")
      .select("id")
      .eq("giveaway_id", a.giveawayId)
      .eq("key", "gold")
      .single(),
    "gold tier",
  );
  await fixture("giveaway_buckets", {
    giveaway_id: a.giveawayId,
    tier_id: tier.id,
    name: "Isolation bucket",
  });
  const packageId = await fixture("giveaway_ticket_packages", {
    giveaway_id: a.giveawayId,
    tier_id: tier.id,
    name: "Isolation package",
    price: 5,
  });
  await must(
    adminClient.rpc("record_giveaway_ticket_sale", {
      p_giveaway_id: a.giveawayId,
      p_package_id: packageId,
      p_quantity: 1,
    }),
    "ticket sale",
  );

  // retention_runs and retention_run_tables became tenant tables in Phase 5b
  // (20260906160000), and nothing but the purge may write them -- they have no
  // insert policy, which is what makes the run log evidence. So the only way to
  // give tenant A rows for the per-table assertions is to run the purge, as
  // service_role because run_retention_purge() is ungranted. A dry run changes
  // nothing and still writes a full log.
  aRetentionRunId = await must(
    service.rpc("run_retention_purge", {
      p_dry_run: true,
      p_trigger: "manual",
      p_tenant_id: tenantA,
    }),
    "tenant A retention run",
  );
});

afterAll(async () => {
  // A's fixtures, newest first so dependents go before what they reference;
  // the giveaway pieces the RPCs created go by their parent.
  // retention_run_tables cascades from the run (composite key, on delete cascade).
  await service.from("retention_runs").delete().eq("id", aRetentionRunId);
  await service
    .from("giveaway_ticket_sales")
    .delete()
    .eq("giveaway_id", a.giveawayId);
  for (const { table, match, via } of [...aFixtures].reverse()) {
    await via.from(table).delete().match(match);
  }
  await service.from("giveaway_tiers").delete().eq("giveaway_id", a.giveawayId);
  await service
    .from("tenants")
    .update({ custom_domain: null })
    .eq("id", tenantA);

  // B, in dependency order; every foreign key to tenants is `no action`.
  for (const table of [
    // The retention tables first: run_tables references people, and both runs
    // and policies reference auth.users (triggered_by, updated_by), so B's
    // accounts cannot be deleted below while these rows stand.
    "retention_run_tables",
    "retention_runs",
    "retention_policies",
    "contact_messages",
    "event_registrations",
    "event_expenses",
    "events",
    "people",
    "programs",
    "app_settings",
    "roles",
  ]) {
    await service.from(table).delete().eq("tenant_id", tenantB);
  }
  for (const userId of [bAdminUserId, bSupportUserId]) {
    if (userId) await deleteTenantUser(userId);
  }
  const { error } = await service.from("tenants").delete().eq("id", tenantB);
  if (error) throw error;
});

describe("the catalog", () => {
  test("every policy on a tenant table carries the tenant predicate and every foreign key between tenant tables is composite", async () => {
    const { data, error } = await adminClient.rpc("tenant_isolation_gaps");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("the gap report is admin-only", async () => {
    const volunteer = await signIn(SEEDED_USERS.volunteer);
    const { data } = await volunteer.rpc("tenant_isolation_gaps");
    expect(data).toEqual([]);
  });
});

describe("sessions see their own tenant", () => {
  test("B's admin has every permission in B and none in A's tables", async () => {
    const { data: isAdmin } = await bAdmin.rpc("is_admin");
    expect(isAdmin).toBe(true);
    const { data: current } = await bAdmin.rpc("current_tenant_id");
    expect(current).toBe(tenantB);
  });

  test("B's admin reads B's rows", async () => {
    for (const table of [
      "programs",
      "people",
      "events",
      "event_registrations",
      "event_expenses",
    ]) {
      const { count, error } = await bAdmin
        .from(table)
        .select("tenant_id", { count: "exact", head: true })
        .eq("tenant_id", tenantB);
      expect(error, table).toBeNull();
      expect(count, table).toBeGreaterThan(0);
    }
  });

  test("the support session holds the same access in B", async () => {
    const { data: isAdmin } = await bSupport.rpc("is_admin");
    expect(isAdmin).toBe(true);
    const { count } = await bSupport
      .from("programs")
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantB);
    expect(count).toBeGreaterThan(0);
  });
});

describe("row-level isolation, per table", () => {
  for (const table of TENANT_TABLES) {
    test(`${table}: A's rows are invisible to B's admin and to B's support session`, async () => {
      const seeded = await service
        .from(table)
        .select("tenant_id", { count: "exact", head: true })
        .eq("tenant_id", tenantA);
      expect(seeded.error).toBeNull();
      // The assertion means nothing on an empty table.
      expect(seeded.count, `${table} has no rows in A`).toBeGreaterThan(0);

      for (const [label, session] of [
        ["admin", bAdmin],
        ["support", bSupport],
      ] as const) {
        const { count, error } = await session
          .from(table)
          .select("tenant_id", { count: "exact", head: true })
          .eq("tenant_id", tenantA);
        expect(error, `${table} ${label}`).toBeNull();
        expect(count, `${table} ${label}`).toBe(0);
      }
    });

    test(`${table}: B's admin can neither update nor delete A's rows`, async () => {
      // A table with no update or delete grant for authenticated at all
      // (person_merges, contact_messages, the template version tables)
      // refuses outright; the rest match nothing.
      const touchedNothing = (
        result: { error: { code?: string } | null; data: unknown },
        label: string,
      ) => {
        if (result.error) {
          expect(result.error.code, label).toBe("42501");
        } else {
          expect(result.data, label).toEqual([]);
        }
      };

      touchedNothing(
        await bAdmin
          .from(table)
          .update({ tenant_id: tenantA })
          .eq("tenant_id", tenantA)
          .select("tenant_id"),
        `${table} update`,
      );
      touchedNothing(
        await bAdmin
          .from(table)
          .delete()
          .eq("tenant_id", tenantA)
          .select("tenant_id"),
        `${table} delete`,
      );
    });

    test(`${table}: B's rows are invisible to A's admin`, async () => {
      const { count, error } = await adminClient
        .from(table)
        .select("tenant_id", { count: "exact", head: true })
        .eq("tenant_id", tenantB);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
  }

  test("audit_log: B's admin sees B's rows and the global ones, never A's", async () => {
    const own = await bAdmin
      .from("audit_log")
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantB);
    expect(own.count).toBeGreaterThan(0);
    const foreign = await bAdmin
      .from("audit_log")
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantA);
    expect(foreign.count).toBe(0);
  });

  test("a row cannot be written into another tenant", async () => {
    const { error } = await bAdmin
      .from("programs")
      .insert({ name: `Smuggled ${run}`, tenant_id: tenantA });
    expect(error?.code).toBe("42501");
  });
});

describe("composite foreign keys", () => {
  test("a B row cannot reference an A parent, whoever writes it", async () => {
    const viaSession = await bAdmin.from("event_registrations").insert({
      event_id: SEEDED_EVENT_IDS.upcoming,
      name: "Cross-tenant",
      email: uniqueEmail("cross"),
    });
    expect(viaSession.error?.code).toBe("23503");

    // service_role bypasses row-level security; the constraint does not care.
    const viaService = await service.from("event_registrations").insert({
      tenant_id: tenantB,
      event_id: SEEDED_EVENT_IDS.upcoming,
      name: "Cross-tenant",
      email: uniqueEmail("cross"),
    });
    expect(viaService.error?.code).toBe("23503");
  });

  test("one-to-one embeds still come back as objects", async () => {
    const { data, error } = await adminClient
      .from("events")
      .select("id, event_logistics(event_id), giveaways(id)")
      .eq("id", SEEDED_EVENT_IDS.past)
      .single();
    expect(error).toBeNull();
    expect(Array.isArray(data?.giveaways)).toBe(false);
    expect(data?.giveaways as unknown).toEqual({ id: a.giveawayId });
  });
});

describe("security definer RPCs answer for the caller's tenant", () => {
  const notFound = async (
    promise: PromiseLike<{ error: { message: string } | null }>,
    fragment: string,
  ) => {
    const { error } = await promise;
    expect(error?.message).toContain(fragment);
  };

  test("finance actions on another tenant's rows", async () => {
    await notFound(
      bAdmin.rpc("approve_event_expense", { p_id: a.expenseId }),
      "Expense not found",
    );
    await notFound(
      bAdmin.rpc("reject_event_expense", { p_id: a.expenseId, p_reason: "x" }),
      "Expense not found",
    );
    await notFound(
      bAdmin.rpc("mark_event_expense_paid", { p_id: a.expenseId }),
      "Expense not found",
    );
  });

  test("event actions on another tenant's event", async () => {
    await notFound(
      bAdmin.rpc("reopen_event_report", {
        p_id: SEEDED_EVENT_IDS.past,
        p_reason: "x",
      }),
      "Event not found",
    );
    await notFound(
      bAdmin.rpc("event_delete_blockers", { p_id: SEEDED_EVENT_IDS.past }),
      "Event not found",
    );
    await notFound(
      bAdmin.rpc("create_event_sponsor", {
        p_event_id: SEEDED_EVENT_IDS.past,
        p_person_id: b.personId,
        p_support_type: "cash",
        p_in_kind_description: null,
        p_contribution_value: 10,
        p_is_public: false,
        p_notes: null,
        p_follow_up_status: "none",
        p_follow_up_notes: null,
      }),
      "Event not found",
    );
    await notFound(
      bAdmin.rpc("seed_giveaway_tiers", { p_giveaway_id: a.giveawayId }),
      "GIVEAWAY_NOT_FOUND",
    );
  });

  test("people actions on another tenant's person", async () => {
    await notFound(
      bAdmin.rpc("set_person_role_tags", {
        p_person_id: SEEDED_PERSON_IDS.volunteer,
        p_roles: ["donor"],
      }),
      "No such person",
    );
    await notFound(
      bAdmin.rpc("delete_rider_profile", {
        p_person_id: SEEDED_PERSON_IDS.volunteer,
      }),
      "No such person",
    );
    await notFound(
      bAdmin.rpc("person_merge_blockers", {
        p_survivor_id: SEEDED_PERSON_IDS.volunteer,
        p_duplicate_id: SEEDED_PERSON_IDS.donor1,
      }),
      "No such person",
    );
    await notFound(
      bAdmin.rpc("record_event_distribution", {
        p_inventory_item_id: a.inventoryItemId,
        p_quantity: 1,
        p_reason: "x",
      }),
      "Inventory item not found",
    );
  });

  test("reports aggregate only the caller's tenant", async () => {
    const finance = await must(
      bAdmin.rpc("get_finance_report_data", {
        p_from: "2000-01-01",
        p_to: "2100-01-01",
      }),
      "finance report",
    );
    for (const key of [
      "revenue",
      "reimbursements",
      "in_kind_items",
      "monetary_donations",
    ]) {
      expect(finance[key], key).toEqual([]);
    }
    // B's one expense, and none of A's twenty-odd.
    expect(finance.expenses).toEqual([
      { status: "submitted", amount: 12.5, event_id: null, event_name: null },
    ]);
    // ... and the same report has rows in A.
    const financeA = await must(
      adminClient.rpc("get_finance_report_data", {
        p_from: "2000-01-01",
        p_to: "2100-01-01",
      }),
      "finance report A",
    );
    expect(financeA.expenses.length).toBeGreaterThan(0);

    const calendar = await must(
      bAdmin.rpc("get_calendar_annual_review_data", {
        p_from: "2000-01-01",
        p_to: "2100-01-01",
      }),
      "calendar report",
    );
    expect(calendar.items).toEqual([]);

    const impact = await must(
      bAdmin.rpc("get_event_impact_derived_data", {
        p_event_id: SEEDED_EVENT_IDS.past,
      }),
      "impact",
    );
    expect(impact.events).toEqual([]);
    expect(impact.registrations).toEqual([]);

    const rollup = await must(
      bAdmin.rpc("get_program_impact_rollup_data", {
        p_program_id: a.programId,
      }),
      "rollup",
    );
    expect(rollup.event_ids).toEqual([]);
  });

  test("lookups by id return nothing for another tenant's ids", async () => {
    const actors = await must(
      bAdmin.rpc("list_expense_actors", {
        p_user_ids: [SEEDED_USER_IDS.admin, SEEDED_USER_IDS.finance],
      }),
      "actors",
    );
    expect(actors).toEqual([]);

    const totals = await must(
      bAdmin.rpc("giveaway_ticket_totals", { p_giveaway_id: a.giveawayId }),
      "totals",
    );
    expect(totals).toEqual([]);

    const sources = await must(
      bAdmin.rpc("get_giveaway_prize_sources", { p_giveaway_id: a.giveawayId }),
      "sources",
    );
    expect(sources).toEqual([]);

    const available = await must(
      bAdmin.rpc("list_available_giveaway_sources", {
        p_event_id: SEEDED_EVENT_IDS.past,
      }),
      "available",
    );
    expect(available).toEqual({ inventoryItems: [], monetaryDonations: [] });

    // The sponsor org is a sponsor in A ...
    const flagsA = await must(
      adminClient.rpc("person_role_flags", {
        p_person_id: SEEDED_PERSON_IDS.sponsor,
      }),
      "flags A",
    );
    expect(flagsA[0].is_sponsor).toBe(true);
    // ... and nothing at all from B.
    const flagsB = await must(
      bAdmin.rpc("person_role_flags", {
        p_person_id: SEEDED_PERSON_IDS.sponsor,
      }),
      "flags B",
    );
    expect(Object.values(flagsB[0]).some(Boolean)).toBe(false);
  });
});

describe("retention rules and runs are the tenant's own", () => {
  // Phase 5b (#707, 20260906160000). Before it, set_retention_policy_mode() and
  // trigger_retention_run() were granted to `authenticated`, gated only on
  // administration:manage, and acted on a global retention_policies -- so any
  // tenant's admin could turn on and run an enforcing purge over every tenant's
  // donor and participant data. These are the assertions that it is now closed.

  test("a provisioned tenant gets its own rules, every one in dry_run", async () => {
    const rules = await must(
      bAdmin.from("retention_policies").select("policy_key, mode"),
      "B's rules",
    );
    expect(rules.length).toBeGreaterThan(0);
    // Enforcement is each organization's own decision after reviewing its own
    // counts (#722). Inheriting the template's answer is the one thing
    // provisioning must not do.
    expect(rules.every((r: { mode: string }) => r.mode === "dry_run")).toBe(
      true,
    );
  });

  test("changing a mode in B leaves A's rule alone", async () => {
    await must(
      bAdmin.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "off",
      }),
      "set mode in B",
    );

    const inA = await must(
      adminClient
        .from("retention_policies")
        .select("mode")
        .eq("policy_key", "contact_messages")
        .single(),
      "A's rule",
    );
    expect(inA.mode).toBe("dry_run");

    await must(
      bAdmin.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "dry_run",
      }),
      "restore mode in B",
    );
  });

  test("a policy key that exists only in another tenant is unknown here", async () => {
    // Nothing distinguishes this from a typo, which is the point: B is told
    // about B's rules and learns nothing about anyone else's.
    const { error } = await bAdmin.rpc("set_retention_policy_mode", {
      p_policy_key: "not_a_policy",
      p_mode: "off",
    });
    expect(error?.message).toContain("No such retention policy");
  });

  test("trigger_retention_run sweeps the caller's tenant and returns its run", async () => {
    const runId = await must(
      bAdmin.rpc("trigger_retention_run", { p_dry_run: true }),
      "B's manual run",
    );
    expect(runId).toBeTruthy();

    const mine = await must(
      bAdmin.from("retention_runs").select("tenant_id").eq("id", runId),
      "B reads its run",
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].tenant_id).toBe(tenantB);

    // A's admin cannot see it, and A gained no run from B's call.
    const theirs = await must(
      adminClient.from("retention_runs").select("id").eq("id", runId),
      "A reads B's run",
    );
    expect(theirs).toHaveLength(0);

    await service.from("retention_runs").delete().eq("id", runId);
  });

  test("A's stale rows survive an enforcing sweep of B", async () => {
    // The rule that mattered most: rule F used to delete user_roles by user id
    // alone, across every tenant the account belonged to.
    const email = uniqueEmail("retention-a");
    await must(
      service.from("contact_messages").insert({
        tenant_id: tenantA,
        name: "A",
        email,
        topic: "general",
        message: "a",
        created_at: new Date(Date.now() - 10 * 365 * 86400000).toISOString(),
      }),
      "A's stale message",
    );

    await must(
      bAdmin.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "enforce",
      }),
      "B enforces",
    );
    const runId = await must(
      service.rpc("run_retention_purge", {
        p_dry_run: false,
        p_trigger: "manual",
        p_tenant_id: tenantB,
      }),
      "enforcing sweep of B",
    );

    const survivors = await must(
      service.from("contact_messages").select("id").eq("email", email),
      "A's message after B's sweep",
    );
    expect(survivors).toHaveLength(1);

    await service.from("retention_runs").delete().eq("id", runId);
    await service.from("contact_messages").delete().eq("email", email);
    await must(
      bAdmin.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "dry_run",
      }),
      "B back to dry_run",
    );
  });
});

describe("the public surface follows the host", () => {
  test("public_events shows the tenant the host belongs to, and nothing without one", async () => {
    const forB = await must(
      anonClient({ host: B_HOST }).from("public_events").select("id"),
      "B",
    );
    expect(forB.map((row: { id: string }) => row.id)).toEqual([b.eventId]);

    const forA = await must(
      anonClient({ host: A_HOST }).from("public_events").select("id"),
      "A",
    );
    const aIds = forA.map((row: { id: string }) => row.id);
    expect(aIds).toContain(SEEDED_EVENT_IDS.upcoming);
    expect(aIds).not.toContain(b.eventId);

    // A subdomain of the custom domain resolves to it too (www., portal.).
    const forWww = await must(
      anonClient({ host: `www.${B_HOST}:3000` })
        .from("public_events")
        .select("id"),
      "www",
    );
    expect(forWww.map((row: { id: string }) => row.id)).toEqual([b.eventId]);

    // Two active tenants and no host: nothing, rather than everything.
    const forNobody = await must(
      anonClient().from("public_events").select("id"),
      "none",
    );
    expect(forNobody).toEqual([]);
  });

  test("an anon submission lands in the host's tenant", async () => {
    const email = uniqueEmail("contact");
    const { data: id, error } = await anonClient({ host: B_HOST }).rpc(
      "submit_contact_message",
      {
        p_name: "Visitor",
        p_email: email,
        p_topic: "general",
        p_message: "hello",
        p_ip_address: uniqueIp(),
      },
    );
    expect(error).toBeNull();
    const row = await must(
      service
        .from("contact_messages")
        .select("tenant_id")
        .eq("id", id)
        .single(),
      "contact row",
    );
    expect(row.tenant_id).toBe(tenantB);
  });

  test("an anon submission with no resolvable tenant is refused", async () => {
    const { error } = await anonClient().rpc("submit_contact_message", {
      p_name: "Visitor",
      p_email: uniqueEmail("contact-none"),
      p_topic: "general",
      p_message: "hello",
      p_ip_address: uniqueIp(),
    });
    expect(error?.message).toContain("No tenant resolved");
  });

  test("a registration is checked against the host's tenant, not just the event id", async () => {
    const wrongHost = await anonClient({ host: A_HOST }).rpc(
      "register_for_event",
      {
        p_event_id: b.eventId,
        p_name: "Visitor",
        p_email: uniqueEmail("reg-wrong"),
        p_phone: null,
        p_party_size: 1,
        p_notes: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(wrongHost.error?.message).toContain("EVENT_NOT_FOUND");

    const rightHost = await anonClient({ host: B_HOST }).rpc(
      "register_for_event",
      {
        p_event_id: b.eventId,
        p_name: "Visitor",
        p_email: uniqueEmail("reg-right"),
        p_phone: null,
        p_party_size: 1,
        p_notes: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(rightHost.error).toBeNull();
    const row = await must(
      service
        .from("event_registrations")
        .select("tenant_id")
        .eq("id", rightHost.data)
        .single(),
      "registration row",
    );
    expect(row.tenant_id).toBe(tenantB);
  });

  test("a first sign-in on a tenant's host joins that tenant", async () => {
    const email = uniqueEmail("newcomer");
    const userId = await createTenantUser(email);
    try {
      const newcomer = await signIn(email, "password123", { host: B_HOST });
      const { data: joined, error } = await newcomer.rpc(
        "ensure_tenant_membership",
      );
      expect(error).toBeNull();
      expect(joined).toBe(tenantB);
      const memberships = await must(
        service
          .from("tenant_memberships")
          .select("tenant_id, kind")
          .eq("user_id", userId),
        "memberships",
      );
      expect(memberships).toEqual([{ tenant_id: tenantB, kind: "member" }]);
    } finally {
      await deleteTenantUser(userId);
    }
  });
});

describe("support grants", () => {
  test("an expired support grant sees nothing", async () => {
    await must(
      service
        .from("tenant_memberships")
        .update({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() })
        .eq("user_id", bSupportUserId)
        .eq("tenant_id", tenantB)
        .select("id"),
      "expire",
    );
    try {
      const { data: current } = await bSupport.rpc("current_tenant_id");
      expect(current).toBeNull();
      const { data: isAdmin } = await bSupport.rpc("is_admin");
      expect(isAdmin).toBe(false);
      const { data: programs } = await bSupport.from("programs").select("id");
      expect(programs).toEqual([]);
    } finally {
      await service
        .from("tenant_memberships")
        .update({
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .eq("user_id", bSupportUserId)
        .eq("tenant_id", tenantB);
    }
  });

  test("a tenant admin cannot mint or extend a support grant", async () => {
    const mint = await bAdmin.from("tenant_memberships").insert({
      user_id: bAdminUserId,
      tenant_id: tenantB,
      kind: "support",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      reason: "self-issued",
    });
    expect(mint.error?.code).toBe("42501");

    const extend = await bAdmin
      .from("tenant_memberships")
      .update({
        expires_at: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq("user_id", bSupportUserId)
      .eq("tenant_id", tenantB)
      .select("id");
    expect(extend.error).toBeNull();
    expect(extend.data).toEqual([]);
  });
});
