// Integration test (#1689): managing per-event access -- list_event_access(),
// invites staged in pending_event_access_grants and claimed at sign-in, and
// set_event_access_offered_areas(). Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`.
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
  signIn,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../../test/seed-fixtures";

const OFFERED_KEY = "event_access.offered_areas";

let coordinator: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let event: { id: string; cleanup: () => Promise<void> };
const createdUsers: string[] = [];

async function resetOffered() {
  const { error } = await serviceRoleClient()
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", OFFERED_KEY);
  if (error) throw error;
}

async function clear() {
  const service = serviceRoleClient();
  await service.from("event_access_grants").delete().eq("event_id", event.id);
  await service
    .from("pending_event_access_grants")
    .delete()
    .eq("event_id", event.id);
}

async function invite(email: string, areas: string[]) {
  return adminClient
    .from("pending_event_access_grants")
    .insert({ event_id: event.id, email, level: "manage", areas })
    .select("id")
    .single();
}

async function createAccount(email: string) {
  const { data, error } = await serviceRoleClient().auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(data.user!.id);
  return data.user!.id;
}

beforeAll(async () => {
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  tenantId = await seededTenantId();
  event = await createPublishedEvent();
  await resetOffered();
});

afterEach(async () => {
  await clear();
  await resetOffered();
});

afterAll(async () => {
  await clear();
  await event.cleanup();
  const service = serviceRoleClient();
  for (const id of createdUsers) {
    await service.from("tenant_memberships").delete().eq("user_id", id);
    await service.auth.admin.deleteUser(id);
  }
});

describe("list_event_access", () => {
  test("events: manage reads grants and invites with names; it cannot write them", async () => {
    const { error: grantError } = await adminClient
      .from("event_access_grants")
      .insert({
        event_id: event.id,
        user_id: SEEDED_USER_IDS.noAccess,
        level: "view",
        areas: ["details"],
      });
    expect(grantError).toBeNull();
    const email = uniqueEmail("event-invite");
    expect((await invite(email, ["details", "media"])).error).toBeNull();

    const { data, error } = await coordinator.rpc("list_event_access", {
      p_event_id: event.id,
    });
    expect(error).toBeNull();
    const rows = data as {
      kind: string;
      email: string;
      granted_by_name: string | null;
    }[];
    expect(rows.map((row) => row.kind).sort()).toEqual(["grant", "invite"]);
    expect(rows.find((row) => row.kind === "grant")?.email).toBe(
      SEEDED_USERS.noAccess,
    );
    expect(rows.find((row) => row.kind === "invite")?.email).toBe(email);
    expect(rows.every((row) => row.granted_by_name)).toBe(true);

    // Reading is not changing (#1685): only administration: manage writes.
    const { error: writeError } = await coordinator
      .from("event_access_grants")
      .insert({
        event_id: event.id,
        user_id: SEEDED_USER_IDS.volunteer,
        level: "view",
        areas: ["details"],
      });
    expect(writeError).not.toBeNull();
    const { error: inviteError } = await coordinator
      .from("pending_event_access_grants")
      .insert({
        event_id: event.id,
        email: uniqueEmail("event-invite"),
        level: "view",
        areas: ["details"],
      });
    expect(inviteError).not.toBeNull();
  });

  test("is empty for anyone without events: manage", async () => {
    await invite(uniqueEmail("event-invite"), ["details"]);
    const { data, error } = await volunteer.rpc("list_event_access", {
      p_event_id: event.id,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("invites", () => {
  test("an invite only offers offered areas, and an address taken elsewhere is refused", async () => {
    const refused = await invite(uniqueEmail("event-invite"), ["expenses"]);
    expect(refused.error?.message).toContain("EVENT_ACCESS_AREA_NOT_OFFERED");

    // An account with no membership here is not this tenant's to invite (#759).
    const orphan = uniqueEmail("event-invite-orphan");
    await createAccount(orphan);
    const taken = await invite(orphan, ["details"]);
    expect(taken.error?.code).toBe("42501");
  });

  test("signing in claims the invite into a grant, keeping only areas still offered", async () => {
    const email = uniqueEmail("event-invite");
    expect((await invite(email, ["details", "media"])).error).toBeNull();
    // The tenant withdraws Media between the invite and the first sign-in.
    const { error: offerError } = await adminClient.rpc(
      "set_event_access_offered_areas",
      { p_areas: ["details", "staff", "registrations", "impact"] },
    );
    expect(offerError).toBeNull();

    const userId = await createAccount(email);
    const invitee = await signIn(email);
    const { error } = await invitee.rpc("claim_pending_role_grants");
    expect(error).toBeNull();

    const service = serviceRoleClient();
    const { data: grants } = await service
      .from("event_access_grants")
      .select("user_id, level, areas, granted_by")
      .eq("event_id", event.id);
    expect(grants).toEqual([
      {
        user_id: userId,
        level: "manage",
        areas: ["details"],
        granted_by: SEEDED_USER_IDS.admin,
      },
    ]);
    const { count } = await service
      .from("pending_event_access_grants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    expect(count).toBe(0);

    const { data: granted } = await invitee.rpc("my_granted_events");
    expect(granted).toEqual([
      { event_id: event.id, level: "manage", areas: ["details"] },
    ]);
  });

  test("an invite with no area still offered stays pending and the sign-in succeeds", async () => {
    const email = uniqueEmail("event-invite");
    expect((await invite(email, ["media"])).error).toBeNull();
    await adminClient.rpc("set_event_access_offered_areas", {
      p_areas: ["details"],
    });

    await createAccount(email);
    const invitee = await signIn(email);
    const { error } = await invitee.rpc("claim_pending_role_grants");
    expect(error).toBeNull();

    const { count } = await serviceRoleClient()
      .from("pending_event_access_grants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    expect(count).toBe(1);
  });
});

describe("set_event_access_offered_areas", () => {
  test("administration: manage sets the list in catalog order", async () => {
    const { data, error } = await adminClient.rpc(
      "set_event_access_offered_areas",
      { p_areas: ["expenses", "details"] },
    );
    expect(error).toBeNull();
    expect(data).toEqual(["details", "expenses"]);

    const { data: stored } = await serviceRoleClient()
      .from("app_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", OFFERED_KEY)
      .single();
    expect(stored?.value).toEqual(["details", "expenses"]);
  });

  test("an unknown area is refused", async () => {
    const { error } = await adminClient.rpc("set_event_access_offered_areas", {
      p_areas: ["details", "nonsense"],
    });
    expect(error?.message).toContain("EVENT_ACCESS_AREA_UNKNOWN");
  });

  test("events: manage cannot change it", async () => {
    const { error } = await coordinator.rpc("set_event_access_offered_areas", {
      p_areas: ["details", "expenses"],
    });
    expect(error?.message).toContain("PERMISSION_DENIED");
  });
});
