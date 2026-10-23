// Integration test (#1687): event-scoped RLS, RPCs and the grant arm reach a
// guest's per-event grant (#1686) and nothing more. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
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
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";

const OFFERED_KEY = "event_access.offered_areas";

let guest: SupabaseClient;
let coordinator: SupabaseClient;
let tenantId: string;
let granted: { id: string; cleanup: () => Promise<void> };
let other: { id: string; cleanup: () => Promise<void> };
let personId: string;
const prizeIds: Record<"granted" | "other", string> = {
  granted: "",
  other: "",
};

async function grant(
  eventId: string,
  level: "view" | "manage",
  areas: string[],
) {
  const { error } = await adminClient.from("event_access_grants").insert({
    event_id: eventId,
    user_id: SEEDED_USER_IDS.noAccess,
    level,
    areas,
  });
  if (error) throw error;
}

async function offer(areas: string[] | null) {
  if (areas === null) {
    const { error } = await serviceRoleClient()
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

async function visibleIds(
  client: SupabaseClient,
  table: string,
  column = "event_id",
) {
  const { data, error } = await client
    .from(table)
    .select(column)
    .in(column, [granted.id, other.id]);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, string>[])
    .map((row) => row[column])
    .sort();
}

beforeAll(async () => {
  guest = await signInAs(SEEDED_USERS.noAccess);
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  tenantId = await seededTenantId();
  granted = await createPublishedEvent();
  other = await createPublishedEvent();
  await offer(null);

  const { data: person, error: personError } = await adminClient
    .from("people")
    .select("id")
    .limit(1)
    .single();
  if (personError) throw personError;
  personId = person.id;

  for (const [key, eventId] of [
    ["granted", granted.id],
    ["other", other.id],
  ] as const) {
    const { error: checklistError } = await adminClient
      .from("event_checklist_items")
      .insert({ event_id: eventId, title: "Book the hall" });
    if (checklistError) throw checklistError;
    const { error: sponsorError } = await adminClient
      .from("event_sponsors")
      .insert({ event_id: eventId, person_id: personId });
    if (sponsorError) throw sponsorError;
    const { data: giveaway, error: giveawayError } = await adminClient
      .from("giveaways")
      .insert({ event_id: eventId })
      .select("id")
      .single();
    if (giveawayError) throw giveawayError;
    const { data: prize, error: prizeError } = await adminClient
      .from("giveaway_prizes")
      .insert({ giveaway_id: giveaway.id, prize_name: "Season pass" })
      .select("id")
      .single();
    if (prizeError) throw prizeError;
    prizeIds[key] = prize.id;
  }
});

afterEach(async () => {
  await clearGrants();
  await offer(null);
});

afterAll(async () => {
  await clearGrants();
  await granted.cleanup();
  await other.cleanup();
});

describe("event-scoped RLS", () => {
  test("a role holder is unaffected: events: view reads every event's rows", async () => {
    expect(await visibleIds(coordinator, "events", "id")).toEqual(
      [granted.id, other.id].sort(),
    );
    expect(await visibleIds(coordinator, "event_checklist_items")).toEqual(
      [granted.id, other.id].sort(),
    );
  });

  test("without a grant a guest reads nothing", async () => {
    expect(await visibleIds(guest, "events", "id")).toEqual([]);
    expect(await visibleIds(guest, "event_checklist_items")).toEqual([]);
  });

  test("a view grant reads its own event's area, and only that event", async () => {
    await grant(granted.id, "view", ["details"]);
    expect(await visibleIds(guest, "events", "id")).toEqual([granted.id]);
    expect(await visibleIds(guest, "event_checklist_items")).toEqual([
      granted.id,
    ]);
    // Another area of the same event stays shut.
    expect(await visibleIds(guest, "event_sponsors")).toEqual([]);
  });

  test("a view grant cannot write", async () => {
    await grant(granted.id, "view", ["details"]);
    const { error } = await guest
      .from("event_checklist_items")
      .insert({ event_id: granted.id, title: "Guest item" });
    expect(error?.code).toBe("42501");
    const { data } = await guest
      .from("events")
      .update({ name: "Renamed by a viewer" })
      .eq("id", granted.id)
      .select("id");
    expect(data).toEqual([]);
  });

  test("a manage grant writes its own event, not another, and cannot create or delete events", async () => {
    await grant(granted.id, "manage", ["details"]);

    const { data: inserted, error } = await guest
      .from("event_checklist_items")
      .insert({ event_id: granted.id, title: "Guest item" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: deleteItemError } = await guest
      .from("event_checklist_items")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteItemError).toBeNull();

    const refused = await guest
      .from("event_checklist_items")
      .insert({ event_id: other.id, title: "Guest item" });
    expect(refused.error?.code).toBe("42501");

    // Moving a row onto an event the grant does not reach is refused too.
    const { data: own } = await guest
      .from("event_checklist_items")
      .select("id")
      .eq("event_id", granted.id)
      .limit(1)
      .single();
    const moved = await guest
      .from("event_checklist_items")
      .update({ event_id: other.id })
      .eq("id", own!.id);
    expect(moved.error?.code).toBe("42501");

    const { data: renamed } = await guest
      .from("events")
      .update({ capacity: 40 })
      .eq("id", granted.id)
      .select("id");
    expect(renamed).toEqual([{ id: granted.id }]);

    const created = await guest.from("events").insert({
      name: "Guest event",
      starts_at: new Date().toISOString(),
      timezone: "America/Chicago",
    });
    expect(created.error?.code).toBe("42501");

    const { data: deleted } = await guest
      .from("events")
      .delete()
      .eq("id", granted.id)
      .select("id");
    expect(deleted).toEqual([]);
  });

  test("a sensitive area reaches nothing until the tenant offers it", async () => {
    await offer(["details", "sponsors", "goods"]);
    await grant(granted.id, "view", ["details", "sponsors", "goods"]);
    expect(await visibleIds(guest, "event_sponsors")).toEqual([granted.id]);

    // Withdrawn: the grant keeps the area, which reaches nothing.
    await offer(["details"]);
    expect(await visibleIds(guest, "event_sponsors")).toEqual([]);
    expect(await visibleIds(guest, "events", "id")).toEqual([granted.id]);
  });

  test("tables without an event_id reach it through their giveaway", async () => {
    await offer(["details", "goods"]);
    await grant(granted.id, "view", ["goods"]);
    const { data, error } = await guest
      .from("giveaway_prizes")
      .select("id")
      .in("id", [prizeIds.granted, prizeIds.other]);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: prizeIds.granted }]);
  });

  test("a revoked grant reaches nothing", async () => {
    await grant(granted.id, "manage", ["details"]);
    expect(await visibleIds(guest, "events", "id")).toEqual([granted.id]);
    await clearGrants();
    expect(await visibleIds(guest, "events", "id")).toEqual([]);
  });

  test("a tenant ledger's event rows are read-only through a grant", async () => {
    await offer(["details", "revenue"]);
    await grant(granted.id, "manage", ["revenue"]);
    const { error } = await guest.from("monetary_donations").insert({
      event_id: granted.id,
      amount: 10,
      method: "cash",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("event-scoped functions", () => {
  test("a function on one event checks that event's grant", async () => {
    await grant(granted.id, "manage", ["registrations"]);
    const ok = await guest.rpc("save_event_registration_questions", {
      p_event_id: granted.id,
      p_questions: [],
    });
    expect(ok.error).toBeNull();
    const refused = await guest.rpc("save_event_registration_questions", {
      p_event_id: other.id,
      p_questions: [],
    });
    expect(refused.error).not.toBeNull();
  });

  test("a sensitive function stays shut until its area is offered and granted", async () => {
    await grant(granted.id, "view", ["details"]);
    const shut = await guest.rpc("list_event_sponsor_items", {
      p_event_id: granted.id,
    });
    expect(shut.error).not.toBeNull();

    await clearGrants();
    await offer(["details", "sponsors"]);
    await grant(granted.id, "view", ["sponsors"]);
    const open = await guest.rpc("list_event_sponsor_items", {
      p_event_id: granted.id,
    });
    expect(open.error).toBeNull();
    const elsewhere = await guest.rpc("list_event_sponsor_items", {
      p_event_id: other.id,
    });
    expect(elsewhere.error).not.toBeNull();
  });

  test("tenant-wide readers answer a grant holder; their writers do not", async () => {
    const before = await guest.rpc("event_media_retention_days");
    expect(before.error).not.toBeNull();

    await grant(granted.id, "manage", ["media"]);
    const after = await guest.rpc("event_media_retention_days");
    expect(after.error).toBeNull();

    const write = await guest.rpc("set_event_media_uploads_enabled", {
      p_enabled: true,
    });
    expect(write.error).not.toBeNull();
  });
});
