// Integration test for per-event registration options (#1407), against the
// real RPCs on a local Supabase stack: saving a question, the sum and cap
// rules on both registration paths, the cap under concurrency, the staff and
// self-service writes, the tenant defaults, and who can read what.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  enableModule,
  SEEDED_USERS,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";

type MyOptionRow = {
  option_id: string;
  quantity: number;
  available: number | null;
  editable: boolean;
};

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
let restoreModule: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const createdPeople: string[] = [];
// register_for_event() mints a person per new address; they outlive the
// event's own cleanup, and test/seed-shape counts them.
const registeredEmails: string[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  for (let i = 0; i < registeredEmails.length; i += 50) {
    await service
      .from("people")
      .delete()
      .in("email", registeredEmails.slice(i, i + 50));
  }
  await service.from("people").delete().in("id", createdPeople);
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  await restoreModule();
});

async function event(overrides?: Parameters<typeof createPublishedEvent>[0]) {
  const fixture = await createPublishedEvent({
    name: `Options ${run}`,
    ...overrides,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function saveOptions(
  eventId: string,
  prompt: string,
  options: { id?: string | null; label: string; cap?: number | null }[],
  as: SupabaseClient = adminClient,
) {
  return as.rpc("save_event_registration_options", {
    p_event_id: eventId,
    p_prompt: prompt,
    p_options: options,
  });
}

async function optionsOf(eventId: string) {
  const { data, error } = await adminClient
    .from("event_registration_options")
    .select("id, label, cap, sort_order")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

/** An event asking the three-way question, the second option capped. */
async function eventWithOptions(cap: number | null = 2) {
  const eventId = await event();
  const { error } = await saveOptions(eventId, "What do you need?", [
    { label: "Own gear" },
    { label: "Need a ticket", cap },
    { label: "Ticket and gear" },
  ]);
  if (error) throw error;
  const [own, ticket, both] = await optionsOf(eventId);
  return { eventId, own: own.id, ticket: ticket.id, both: both.id };
}

function register(
  eventId: string,
  partySize: number,
  counts?: Record<string, number>,
) {
  const email = uniqueEmail(`options-${run}`);
  registeredEmails.push(email);
  return anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Options Tester",
    p_email: email,
    p_phone: "",
    p_party_size: partySize,
    p_notes: "",
    p_ip_address: uniqueIp(),
    p_option_counts: counts,
  });
}

async function countsOf(registrationId: string) {
  const { data, error } = await adminClient
    .from("event_registration_option_counts")
    .select("option_id, label, quantity")
    .eq("registration_id", registrationId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

async function registrationsOf(eventId: string) {
  const { count, error } = await adminClient
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw error;
  return count;
}

describe("save_event_registration_options", () => {
  test("keeps ids across rename and reorder, and removes what is left out", async () => {
    const { eventId, own, ticket, both } = await eventWithOptions();

    const { error } = await saveOptions(
      eventId,
      "What does each person need?",
      [
        { id: ticket, label: "I need a ticket", cap: 5 },
        { id: own, label: "I'll use my own" },
      ],
    );
    expect(error).toBeNull();

    const options = await optionsOf(eventId);
    expect(
      options.map((option) => [option.id, option.label, option.cap]),
    ).toEqual([
      [ticket, "I need a ticket", 5],
      [own, "I'll use my own", null],
    ]);
    expect(options.some((option) => option.id === both)).toBe(false);

    const { data } = await adminClient
      .from("events")
      .select("registration_options_prompt")
      .eq("id", eventId)
      .single();
    expect(data?.registration_options_prompt).toBe(
      "What does each person need?",
    );
  });

  test("an empty list removes the question with its prompt", async () => {
    const { eventId } = await eventWithOptions();
    expect((await saveOptions(eventId, "ignored", [])).error).toBeNull();
    expect(await optionsOf(eventId)).toEqual([]);
    const { data } = await adminClient
      .from("events")
      .select("registration_options_prompt")
      .eq("id", eventId)
      .single();
    expect(data?.registration_options_prompt).toBeNull();
  });

  test("refuses a missing prompt, a duplicate and a bad cap", async () => {
    const eventId = await event();
    expect(
      (await saveOptions(eventId, " ", [{ label: "A" }])).error?.message,
    ).toBe("EVENT_OPTIONS_PROMPT_REQUIRED");
    expect(
      (await saveOptions(eventId, "Q", [{ label: "A" }, { label: " a " }]))
        .error?.message,
    ).toBe("EVENT_OPTIONS_DUPLICATE");
    expect(
      (await saveOptions(eventId, "Q", [{ label: "A", cap: -1 }])).error
        ?.message,
    ).toBe("EVENT_OPTIONS_INVALID");
  });

  test("needs events: manage", async () => {
    const eventId = await event();
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await saveOptions(
      eventId,
      "Q",
      [{ label: "A" }],
      volunteer,
    );
    expect(error).not.toBeNull();
    expect(await optionsOf(eventId)).toEqual([]);
  });
});

describe("registering for an event with options", () => {
  test("an event with no options is unchanged, and refuses counts it cannot place", async () => {
    const eventId = await event();
    expect((await register(eventId, 2)).error).toBeNull();
    expect((await register(eventId, 1, {})).error).toBeNull();
    expect(
      (await register(eventId, 1, { [crypto.randomUUID()]: 1 })).error?.message,
    ).toBe("EVENT_OPTIONS_INVALID");
  });

  test("requires an answer, and a refusal leaves no registration behind", async () => {
    const { eventId } = await eventWithOptions();
    expect((await register(eventId, 1)).error?.message).toBe(
      "EVENT_OPTIONS_REQUIRED",
    );
    expect(await registrationsOf(eventId)).toBe(0);
  });

  test("requires the counts to add up to the party", async () => {
    const { eventId, own, both } = await eventWithOptions();
    expect(
      (await register(eventId, 3, { [own]: 1, [both]: 1 })).error?.message,
    ).toBe("EVENT_OPTIONS_MISMATCH");
    expect((await register(eventId, 1, { [own]: 1.5 })).error?.message).toBe(
      "EVENT_OPTIONS_INVALID",
    );
    expect(
      (await register(eventId, 1, { [own]: -1, [both]: 2 })).error?.message,
    ).toBe("EVENT_OPTIONS_INVALID");
    expect(await registrationsOf(eventId)).toBe(0);
  });

  test("stores positive counts with the label as shown", async () => {
    const { eventId, own, ticket, both } = await eventWithOptions();
    const { data: id, error } = await register(eventId, 3, {
      [own]: 2,
      [ticket]: 0,
      [both]: 1,
    });
    expect(error).toBeNull();
    expect(await countsOf(id as string)).toEqual([
      { option_id: own, label: "Own gear", quantity: 2 },
      { option_id: both, label: "Ticket and gear", quantity: 1 },
    ]);

    // Renaming keeps the answer's words; removing keeps the answer.
    await saveOptions(eventId, "What do you need?", [
      { id: own, label: "Renamed" },
      { id: ticket, label: "Need a ticket", cap: 2 },
    ]);
    expect(await countsOf(id as string)).toEqual([
      { option_id: own, label: "Own gear", quantity: 2 },
      { option_id: null, label: "Ticket and gear", quantity: 1 },
    ]);
  });

  test("refuses a capped option once full, and says so publicly", async () => {
    const { eventId, own, ticket } = await eventWithOptions(2);
    expect((await register(eventId, 2, { [ticket]: 2 })).error).toBeNull();
    expect((await register(eventId, 1, { [ticket]: 1 })).error?.message).toBe(
      "EVENT_OPTION_FULL",
    );
    // The other options stay open.
    expect((await register(eventId, 1, { [own]: 1 })).error).toBeNull();

    const { data } = await anon
      .from("public_event_registration_options")
      .select("id, is_full")
      .eq("event_id", eventId);
    expect(new Map((data ?? []).map((row) => [row.id, row.is_full]))).toEqual(
      new Map([
        [own, false],
        [ticket, true],
        [(await optionsOf(eventId))[2].id, false],
      ]),
    );
  });

  test("cannot be oversubscribed by registrations arriving together", async () => {
    const { eventId, ticket } = await eventWithOptions(3);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => register(eventId, 1, { [ticket]: 1 })),
    );
    expect(results.filter((result) => result.error === null)).toHaveLength(3);
    expect(
      results
        .filter((result) => result.error !== null)
        .every((result) => result.error?.message === "EVENT_OPTION_FULL"),
    ).toBe(true);
    const { data } = await adminClient
      .from("event_registration_option_counts")
      .select("quantity")
      .eq("option_id", ticket);
    expect((data ?? []).reduce((sum, row) => sum + row.quantity, 0)).toBe(3);
  });
});

describe("the staff path", () => {
  test("is optional and not held to caps", async () => {
    const { eventId, ticket } = await eventWithOptions(1);
    const { data: registration, error } = await adminClient
      .from("event_registrations")
      .insert({ event_id: eventId, name: "Walk-in", email: "", party_size: 2 })
      .select("id")
      .single();
    if (error) throw error;

    const set = (counts: Record<string, number>) =>
      adminClient.rpc("set_registrant_option_counts", {
        p_registration_id: registration.id,
        p_counts: counts,
      });

    expect((await set({ [ticket]: 2 })).error).toBeNull();
    expect(await countsOf(registration.id)).toEqual([
      { option_id: ticket, label: "Need a ticket", quantity: 2 },
    ]);
    expect((await set({ [ticket]: 1 })).error?.message).toBe(
      "EVENT_OPTIONS_MISMATCH",
    );
    expect((await set({})).error).toBeNull();
    expect(await countsOf(registration.id)).toEqual([]);

    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error: refused } = await volunteer.rpc(
      "set_registrant_option_counts",
      { p_registration_id: registration.id, p_counts: { [ticket]: 2 } },
    );
    expect(refused).not.toBeNull();
  });
});

describe("the registrant's own answer", () => {
  async function constituent() {
    const email = uniqueEmail(`options-my-${run}`);
    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    createdUsers.push(user.user!.id);
    const { data: person, error } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: `Options Registrant ${run}`,
        email,
        auth_user_id: user.user!.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    createdPeople.push(person.id as string);
    return signIn(email);
  }

  test("registers, reads back and changes it, held to the caps", async () => {
    const { eventId, own, ticket } = await eventWithOptions(2);
    const client = await constituent();

    const { data: id, error } = await client.rpc("register_myself_for_event", {
      p_event_id: eventId,
      p_party_size: 2,
      p_ip_address: uniqueIp(),
      p_option_counts: { [own]: 2 },
    });
    expect(error).toBeNull();
    const registrationId = id as string;

    // Somebody else takes one of the two tickets.
    expect((await register(eventId, 1, { [ticket]: 1 })).error).toBeNull();

    const { data: rows } = await client.rpc("my_registration_option_counts", {
      p_registration_id: registrationId,
    });
    expect(
      ((rows ?? []) as MyOptionRow[]).map((row) => [
        row.option_id,
        row.quantity,
        row.available,
      ]),
    ).toEqual([
      [own, 2, null],
      [ticket, 0, 1],
      [expect.any(String), 0, null],
    ]);
    expect(rows?.[0].editable).toBe(true);

    const set = (counts: Record<string, number>) =>
      client.rpc("set_my_registration_option_counts", {
        p_registration_id: registrationId,
        p_counts: counts,
      });
    expect((await set({ [ticket]: 2 })).error?.message).toBe(
      "EVENT_OPTION_FULL",
    );
    expect((await set({ [own]: 1, [ticket]: 1 })).error).toBeNull();
    expect((await set({ [own]: 1 })).error?.message).toBe(
      "EVENT_OPTIONS_MISMATCH",
    );

    // Nobody else's registration, and nothing to say whether it exists.
    const other = await constituent();
    expect(
      (
        await other.rpc("set_my_registration_option_counts", {
          p_registration_id: registrationId,
          p_counts: { [own]: 2 },
        })
      ).error?.message,
    ).toBe("REGISTRATION_NOT_FOUND");
    const { data: none } = await other.rpc("my_registration_option_counts", {
      p_registration_id: registrationId,
    });
    expect(none).toEqual([]);

    // Closed with the registration window.
    await adminClient
      .from("events")
      .update({ registration_enabled: false })
      .eq("id", eventId);
    expect((await set({ [own]: 2 })).error?.message).toBe(
      "REGISTRATION_CLOSED",
    );

    await service.from("event_registrations").delete().eq("id", registrationId);
  });
});

describe("tenant defaults", () => {
  test("are copied onto a new event, and only a new one", async () => {
    const before = await event();
    await service.from("app_settings").upsert(
      {
        tenant_id: tenantId,
        key: "events.registration_option_defaults",
        value: {
          prompt: "Default question",
          options: [{ label: "First" }, { label: "Second", cap: 4 }],
        },
      },
      { onConflict: "tenant_id,key" },
    );
    try {
      const after = await event();
      expect(
        (await optionsOf(after)).map((option) => [option.label, option.cap]),
      ).toEqual([
        ["First", null],
        ["Second", 4],
      ]);
      const { data } = await adminClient
        .from("events")
        .select("registration_options_prompt")
        .eq("id", after)
        .single();
      expect(data?.registration_options_prompt).toBe("Default question");
      expect(await optionsOf(before)).toEqual([]);
    } finally {
      await service
        .from("app_settings")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("key", "events.registration_option_defaults");
    }
  });
});

describe("who can read the tables", () => {
  test("anon reads neither table directly; only the public view", async () => {
    const { eventId, own } = await eventWithOptions();
    expect((await register(eventId, 1, { [own]: 1 })).error).toBeNull();

    for (const table of [
      "event_registration_options",
      "event_registration_option_counts",
    ] as const) {
      const { data } = await anon.from(table).select("id").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    const { data: hidden } = await noAccess
      .from("event_registration_option_counts")
      .select("id")
      .limit(1);
    expect(hidden ?? []).toEqual([]);

    // Nobody writes them directly, admin included: only the definer functions do.
    const { error } = await adminClient
      .from("event_registration_options")
      .insert({ event_id: eventId, label: "Sneaky" });
    expect(error).not.toBeNull();
  });
});
