// Integration test for the per-tenant under-18 setting (#1416), against the
// real RPCs on a local Supabase stack: with the setting off a registration
// needs no answer and anything sent is discarded; with it on, #685's rules
// hold; the public form and the portal switch read and write the same row.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  seededTenantId,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));
// As in registration-riding.integration.test.ts: the confirmation email is
// scheduled with after(), which throws outside a request scope.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
mock.module("next/server", () => ({ ...nextServer, after: () => {} }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

const SETTING_KEY = "registration.asks_about_minors";
const service = serviceRoleClient();
const tenantId = await seededTenantId();
const run = crypto.randomUUID().slice(0, 8);
const fixture = await createPublishedEvent({ name: `Minors setting ${run}` });
const registeredEmails: string[] = [];

/** Back to no row -- the default, on -- after every case. */
async function clearSetting() {
  const { error } = await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", SETTING_KEY);
  if (error) throw error;
}

async function setSetting(value: boolean) {
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: SETTING_KEY, value },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

afterEach(clearSetting);

afterAll(async () => {
  await clearSetting();
  await fixture.cleanup();
  if (registeredEmails.length) {
    await service.from("people").delete().in("email", registeredEmails);
  }
});

function nextEmail() {
  const email = uniqueEmail(`minors-setting-${run}`);
  registeredEmails.push(email);
  return email;
}

/** Straight at the RPC, as the public API calls it. */
async function registerDirect(fields: Record<string, unknown>) {
  const email = nextEmail();
  const { error } = await anonClient().rpc("register_for_event", {
    p_event_id: fixture.id,
    p_name: "Minors Setting Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 2,
    p_notes: null,
    p_ip_address: uniqueIp(),
    ...fields,
  } as never);
  return { email, error };
}

async function storedMinors(email: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select(
      "party_includes_minor, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone",
    )
    .eq("event_id", fixture.id)
    .eq("email", email)
    .single();
  if (error) throw error;
  return data;
}

const NOTHING_STORED = {
  party_includes_minor: null,
  accompanying_adult_name: null,
  accompanying_adult_phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
};

const CONTACTS = {
  p_accompanying_adult_name: "Robin Rivera",
  p_accompanying_adult_phone: "555-0101",
  p_emergency_contact_name: "Sam Rivera",
  p_emergency_contact_phone: "555-0102",
};

describe("with the setting off", () => {
  test("the form registers without the question", async () => {
    await setSetting(false);
    currentIp = uniqueIp();
    const email = nextEmail();
    const fd = new FormData();
    fd.set("name", "Minors Setting Registrant");
    fd.set("email", email);

    const result = await registerForEventAction(fixture.id, fd);

    expect(result).toMatchObject({ success: true });
    expect(await storedMinors(email)).toEqual(NOTHING_STORED);
  });

  test("an answer and contacts sent anyway are discarded", async () => {
    await setSetting(false);
    const { email, error } = await registerDirect({
      p_party_includes_minor: true,
      ...CONTACTS,
    });
    expect(error).toBeNull();
    expect(await storedMinors(email)).toEqual(NOTHING_STORED);
  });

  test("a yes without contacts is not refused", async () => {
    await setSetting(false);
    const { email, error } = await registerDirect({
      p_party_includes_minor: true,
    });
    expect(error).toBeNull();
    expect(await storedMinors(email)).toEqual(NOTHING_STORED);
  });

  test("the public form reads it as off", async () => {
    await setSetting(false);
    const { data, error } = await anonClient()
      .from("public_registration_settings")
      .select("asks_about_minors")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ asks_about_minors: false });
  });
});

describe("with the setting on (no row)", () => {
  test("a yes without contacts is refused", async () => {
    const { error } = await registerDirect({ p_party_includes_minor: true });
    expect(error?.message).toBe("MINOR_CONTACTS_REQUIRED");
  });

  test("a yes with contacts stores them", async () => {
    const { email, error } = await registerDirect({
      p_party_includes_minor: true,
      ...CONTACTS,
    });
    expect(error).toBeNull();
    expect(await storedMinors(email)).toEqual({
      party_includes_minor: true,
      accompanying_adult_name: "Robin Rivera",
      accompanying_adult_phone: "555-0101",
      emergency_contact_name: "Sam Rivera",
      emergency_contact_phone: "555-0102",
    });
  });

  test("the form still requires an answer", async () => {
    currentIp = uniqueIp();
    const fd = new FormData();
    fd.set("name", "Minors Setting Registrant");
    fd.set("email", nextEmail());
    fd.set("minorsAsked", "on");

    const result = await registerForEventAction(fixture.id, fd);

    expect(result).toMatchObject({ step: "event" });
  });

  test("the public form reads it as on", async () => {
    const { data } = await anonClient()
      .from("public_registration_settings")
      .select("asks_about_minors")
      .single();
    expect(data).toEqual({ asks_about_minors: true });
  });
});

describe("the portal switch", () => {
  test("an events manager turns it off and on again", async () => {
    expect(
      await adminClient.rpc("registration_asks_about_minors"),
    ).toMatchObject({ data: true, error: null });

    const off = await adminClient.rpc("set_registration_asks_about_minors", {
      p_enabled: false,
    });
    expect(off.error).toBeNull();
    expect((await adminClient.rpc("registration_asks_about_minors")).data).toBe(
      false,
    );

    const on = await adminClient.rpc("set_registration_asks_about_minors", {
      p_enabled: true,
    });
    expect(on.error).toBeNull();
    expect((await adminClient.rpc("registration_asks_about_minors")).data).toBe(
      true,
    );
  });

  // `volunteer` holds events:view and nothing higher.
  test("is closed to anyone without events:manage", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    for (const client of [volunteer, anonClient()]) {
      const { error } = await client.rpc("set_registration_asks_about_minors", {
        p_enabled: false,
      });
      expect(error).not.toBeNull();
    }
    const { data } = await volunteer.rpc("registration_asks_about_minors");
    expect(data).toBeNull();
  });
});
