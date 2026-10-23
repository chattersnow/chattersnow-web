// Integration test (#1686): per-event access grants, the tenant's offered
// areas, and has_event_access() / my_event_access() / my_granted_events(),
// against a real local stack. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  seededTenantId,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  withModule,
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";

const OFFERED_KEY = "event_access.offered_areas";

let guest: SupabaseClient;
let coordinator: SupabaseClient;
let former: SupabaseClient;
let tenantId: string;
let granted: { id: string; cleanup: () => Promise<void> };
let other: { id: string; cleanup: () => Promise<void> };
let otherTenantId: string | null = null;

async function grant(
  eventId: string,
  userId: string,
  level: "view" | "manage",
  areas: string[],
  as: SupabaseClient = adminClient,
) {
  return as
    .from("event_access_grants")
    .insert({ event_id: eventId, user_id: userId, level, areas })
    .select("id")
    .single();
}

async function access(
  client: SupabaseClient,
  eventId: string,
  table: string,
  level: "view" | "manage",
) {
  const { data, error } = await client.rpc("has_event_access", {
    p_event_id: eventId,
    p_table_name: table,
    p_min_level: level,
  });
  if (error) throw error;
  return data as boolean;
}

async function offer(areas: string[] | null) {
  const service = serviceRoleClient();
  if (areas === null) {
    const { error } = await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", OFFERED_KEY);
    if (error) throw error;
    return;
  }
  const { error } = await adminClient
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: OFFERED_KEY, value: areas },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

async function clearGrants() {
  const { error } = await serviceRoleClient()
    .from("event_access_grants")
    .delete()
    .in("event_id", [granted.id, other.id]);
  if (error) throw error;
}

beforeAll(async () => {
  guest = await signInAs(SEEDED_USERS.noAccess);
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  former = await signInAs(SEEDED_USERS.former);
  tenantId = await seededTenantId();
  granted = await createPublishedEvent();
  other = await createPublishedEvent();
  await offer(null);
});

afterEach(async () => {
  await clearGrants();
  await offer(null);
});

afterAll(async () => {
  await clearGrants();
  await granted.cleanup();
  await other.cleanup();
  if (otherTenantId) {
    const service = serviceRoleClient();
    await service
      .from("event_access_grants")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service.from("events").delete().eq("tenant_id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  }
});

describe("has_event_access", () => {
  test("a role holder is unaffected: events: manage reaches every event", async () => {
    for (const eventId of [granted.id, other.id]) {
      expect(await access(coordinator, eventId, "events", "manage")).toBe(true);
      expect(
        await access(coordinator, eventId, "event_sponsors", "manage"),
      ).toBe(true);
    }
    // ...and still nothing beyond its own resources.
    expect(
      await access(coordinator, granted.id, "monetary_donations", "view"),
    ).toBe(false);
  });

  test("a guest reaches only the granted event and areas, at the granted level", async () => {
    const { error } = await grant(
      granted.id,
      SEEDED_USER_IDS.noAccess,
      "view",
      ["details", "registrations"],
    );
    expect(error).toBeNull();

    expect(await access(guest, granted.id, "events", "view")).toBe(true);
    expect(await access(guest, granted.id, "event_registrations", "view")).toBe(
      true,
    );
    expect(await access(guest, granted.id, "event_carpool_cars", "view")).toBe(
      true,
    );
    expect(await access(guest, granted.id, "events", "manage")).toBe(false);
    expect(await access(guest, granted.id, "event_media", "view")).toBe(false);
    expect(await access(guest, granted.id, "event_sponsors", "view")).toBe(
      false,
    );
    expect(await access(guest, other.id, "events", "view")).toBe(false);
    // An unmapped table is reachable by role only.
    expect(await access(guest, granted.id, "conduct_reports", "view")).toBe(
      false,
    );

    const { data: areas, error: areasError } = await guest.rpc(
      "my_event_access",
      {
        p_event_id: granted.id,
      },
    );
    expect(areasError).toBeNull();
    const byArea = Object.fromEntries(
      (areas as { area_key: string; level: string }[]).map((r) => [
        r.area_key,
        r.level,
      ]),
    );
    expect(byArea).toMatchObject({
      details: "view",
      registrations: "view",
      media: "none",
      expenses: "none",
    });

    const { data: otherAreas } = await guest.rpc("my_event_access", {
      p_event_id: other.id,
    });
    expect(
      (otherAreas as { level: string }[]).every((r) => r.level === "none"),
    ).toBe(true);

    const { data: events, error: eventsError } =
      await guest.rpc("my_granted_events");
    expect(eventsError).toBeNull();
    expect(events).toEqual([
      {
        event_id: granted.id,
        level: "view",
        areas: ["details", "registrations"],
      },
    ]);
  });

  test("the guest sees their own grant; nobody else's", async () => {
    await grant(granted.id, SEEDED_USER_IDS.noAccess, "view", ["details"]);
    await grant(granted.id, SEEDED_USER_IDS.volunteer, "view", ["details"]);
    const { data } = await guest.from("event_access_grants").select("user_id");
    expect(data).toEqual([{ user_id: SEEDED_USER_IDS.noAccess }]);
  });

  test("a sensitive area is blocked until the tenant offers it", async () => {
    const refused = await grant(
      granted.id,
      SEEDED_USER_IDS.noAccess,
      "manage",
      ["details", "expenses"],
    );
    expect(refused.error?.message).toContain("EVENT_ACCESS_AREA_NOT_OFFERED");

    const { data: row } = await grant(
      granted.id,
      SEEDED_USER_IDS.noAccess,
      "manage",
      ["details"],
    );
    await offer(["details", "expenses"]);
    const added = await adminClient
      .from("event_access_grants")
      .update({ areas: ["details", "expenses"] })
      .eq("id", row!.id);
    expect(added.error).toBeNull();
    expect(await access(guest, granted.id, "event_expenses", "manage")).toBe(
      true,
    );

    // Withdrawn: the area stays on the grant but reaches nothing.
    await offer(null);
    expect(await access(guest, granted.id, "event_expenses", "view")).toBe(
      false,
    );
    expect(await access(guest, granted.id, "events", "manage")).toBe(true);
    // ...and changing the grant's level does not trip over it.
    const relevel = await adminClient
      .from("event_access_grants")
      .update({ level: "view" })
      .eq("id", row!.id);
    expect(relevel.error).toBeNull();
  });

  test("unknown and duplicate areas are refused", async () => {
    const unknown = await grant(granted.id, SEEDED_USER_IDS.noAccess, "view", [
      "nope",
    ]);
    expect(unknown.error?.message).toContain("EVENT_ACCESS_AREA_UNKNOWN");
    const dup = await grant(granted.id, SEEDED_USER_IDS.noAccess, "view", [
      "details",
      "details",
    ]);
    expect(dup.error?.message).toContain("EVENT_ACCESS_AREA_DUPLICATE");
  });

  test("only administration: manage writes grants; events: manage is not enough", async () => {
    const { error } = await grant(
      granted.id,
      SEEDED_USER_IDS.noAccess,
      "view",
      ["details"],
      coordinator,
    );
    expect(error).not.toBeNull();
  });

  test("a revoked grant blocks", async () => {
    const { data: row } = await grant(
      granted.id,
      SEEDED_USER_IDS.noAccess,
      "manage",
      ["details"],
    );
    expect(await access(guest, granted.id, "events", "manage")).toBe(true);
    const { error } = await adminClient
      .from("event_access_grants")
      .delete()
      .eq("id", row!.id);
    expect(error).toBeNull();
    expect(await access(guest, granted.id, "events", "view")).toBe(false);
    const { data: events } = await guest.rpc("my_granted_events");
    expect(events).toEqual([]);
  });

  test("a deactivated account is blocked", async () => {
    await grant(granted.id, SEEDED_USER_IDS.former, "manage", ["details"]);
    expect(await access(former, granted.id, "events", "view")).toBe(false);
    const { data: events } = await former.rpc("my_granted_events");
    expect(events).toEqual([]);
  });

  test("a module the tenant is not entitled to is blocked", async () => {
    await grant(granted.id, SEEDED_USER_IDS.noAccess, "manage", ["details"]);
    await withModule(tenantId, "events", false, async () => {
      expect(await access(guest, granted.id, "events", "view")).toBe(false);
    });
    expect(await access(guest, granted.id, "events", "view")).toBe(true);
  });

  test("a grant in another tenant reaches nothing here", async () => {
    const service = serviceRoleClient();
    const run = crypto.randomUUID().slice(0, 8);
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Event Access Other ${run}`,
      p_slug: `event-access-other-${run}`,
      p_custom_domain: `event-access-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    // Archived at once, like item-history's: a second active tenant would
    // move public_tenant_id() off its sole-active fallback for other files.
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);

    const event = await service
      .from("events")
      .insert({
        tenant_id: otherTenantId,
        name: `Other tenant event ${run}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        timezone: "America/Chicago",
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (event.error) throw event.error;
    const crossGrant = await service.from("event_access_grants").insert({
      tenant_id: otherTenantId,
      event_id: event.data.id,
      user_id: SEEDED_USER_IDS.noAccess,
      level: "manage",
      areas: ["details"],
    });
    if (crossGrant.error) throw crossGrant.error;
    // The grant joined the guest to that tenant; take it back so their
    // session still resolves to the seeded tenant alone.
    await service
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", otherTenantId)
      .eq("user_id", SEEDED_USER_IDS.noAccess);

    expect(await access(guest, event.data.id, "events", "view")).toBe(false);
    const { data: events } = await guest.rpc("my_granted_events");
    expect(events).toEqual([]);
    const { data: rows } = await guest.from("event_access_grants").select("id");
    expect(rows).toEqual([]);
  });

  test("a grant gives a new guest a membership in the tenant", async () => {
    const service = serviceRoleClient();
    const created = await service.auth.admin.createUser({
      email: uniqueEmail("event-guest"),
      password: "password123",
      email_confirm: true,
    });
    if (created.error) throw created.error;
    const userId = created.data.user.id;
    try {
      const { error } = await grant(granted.id, userId, "view", ["details"]);
      expect(error).toBeNull();
      const { data } = await service
        .from("tenant_memberships")
        .select("kind")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      expect(data).toEqual([{ kind: "member" }]);
    } finally {
      await service.from("event_access_grants").delete().eq("user_id", userId);
      await service.from("tenant_memberships").delete().eq("user_id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  });
});
