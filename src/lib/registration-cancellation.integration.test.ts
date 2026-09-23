// Integration test for cancelling an event registration (#1418), against the
// real RPCs on a local Supabase stack: what a cancellation frees (seats, an
// option's cap, a discount code), the undo and when it is refused, check-in,
// and who may cancel what.
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
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
let restoreModule: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const createdPeople: string[] = [];
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
    name: `Cancellation ${run}`,
    ...overrides,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function register(
  eventId: string,
  partySize: number,
  counts?: Record<string, number>,
) {
  const email = uniqueEmail(`cancel-${run}`);
  registeredEmails.push(email);
  return anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Cancellation Tester",
    p_email: email,
    p_phone: "",
    p_party_size: partySize,
    p_notes: "",
    p_ip_address: uniqueIp(),
    p_option_counts: counts,
  });
}

async function registered(
  eventId: string,
  partySize: number,
  counts?: Record<string, number>,
) {
  const { data, error } = await register(eventId, partySize, counts);
  if (error) throw error;
  return data as string;
}

function cancel(
  registrationId: string,
  as: SupabaseClient = adminClient,
  reason = "not_attending",
) {
  return as.rpc("cancel_event_registration", {
    p_registration_id: registrationId,
    p_reason: reason,
    p_note: "Called to say",
  });
}

function restore(registrationId: string) {
  return adminClient.rpc("restore_event_registration", {
    p_registration_id: registrationId,
  });
}

async function registration(id: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .select(
      "cancelled_at, cancelled_by, cancellation_reason, cancellation_note, checked_in_at",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function constituent() {
  const email = uniqueEmail(`cancel-my-${run}`);
  const { data: user, error: userError } = await service.auth.admin.createUser({
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
      name: `Cancellation Registrant ${run}`,
      email,
      auth_user_id: user.user!.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  createdPeople.push(person.id as string);
  return { client: await signIn(email), userId: user.user!.id };
}

async function registerMyself(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.rpc("register_myself_for_event", {
    p_event_id: eventId,
    p_party_size: 1,
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  return data as string;
}

describe("a staff cancellation", () => {
  test("records who, when and why, and frees the seats", async () => {
    const eventId = await event({ capacity: 2 });
    const first = await registered(eventId, 2);
    expect((await register(eventId, 1)).error?.message).toBe(
      "EVENT_AT_CAPACITY",
    );

    expect((await cancel(first)).error).toBeNull();
    const row = await registration(first);
    expect(row.cancelled_at).not.toBeNull();
    expect(row.cancelled_by).not.toBeNull();
    expect(row.cancellation_reason).toBe("not_attending");
    expect(row.cancellation_note).toBe("Called to say");

    expect((await register(eventId, 2)).error).toBeNull();
  });

  test("is undone only while the seats are still there", async () => {
    const eventId = await event({ capacity: 2 });
    const first = await registered(eventId, 2);
    expect((await cancel(first)).error).toBeNull();

    // Nobody took them yet: the undo puts it back.
    expect((await restore(first)).error).toBeNull();
    expect((await registration(first)).cancelled_at).toBeNull();

    expect((await cancel(first)).error).toBeNull();
    await registered(eventId, 1);
    expect((await restore(first)).error?.message).toBe("EVENT_AT_CAPACITY");
  });

  test("frees an option's cap, and the undo is held to it", async () => {
    const eventId = await event();
    const { error: saveError } = await adminClient.rpc(
      "save_event_registration_options",
      {
        p_event_id: eventId,
        p_prompt: "What do you need?",
        p_options: [{ label: "Own gear" }, { label: "Ticket", cap: 1 }],
      },
    );
    if (saveError) throw saveError;
    const { data: options } = await adminClient
      .from("event_registration_options")
      .select("id, label")
      .eq("event_id", eventId)
      .order("sort_order");
    const ticket = options!.find((option) => option.label === "Ticket")!.id;

    const first = await registered(eventId, 1, { [ticket]: 1 });
    expect((await register(eventId, 1, { [ticket]: 1 })).error?.message).toBe(
      "EVENT_OPTION_FULL",
    );

    expect((await cancel(first)).error).toBeNull();
    const { data: publicOptions } = await anon
      .from("public_event_registration_options")
      .select("id, is_full")
      .eq("event_id", eventId);
    expect(publicOptions!.find((row) => row.id === ticket)!.is_full).toBe(
      false,
    );
    // The answer is kept, so an undo puts back exactly what was there.
    const { data: kept } = await adminClient
      .from("event_registration_option_counts")
      .select("option_id, quantity")
      .eq("registration_id", first);
    expect(kept).toEqual([{ option_id: ticket, quantity: 1 }]);

    await registered(eventId, 1, { [ticket]: 1 });
    expect((await restore(first)).error?.message).toBe("EVENT_OPTION_FULL");
  });

  test("releases an unsent discount code, and keeps a sent one", async () => {
    const eventId = await event({ auto_assign_discount_codes: true });
    const { error: codeError } = await adminClient
      .from("discount_codes")
      .insert([
        { event_id: eventId, code: `A-${run}` },
        { event_id: eventId, code: `B-${run}` },
      ]);
    if (codeError) throw codeError;

    const unsent = await registered(eventId, 1);
    const sent = await registered(eventId, 1);
    await adminClient
      .from("discount_codes")
      .update({ sent_at: new Date().toISOString() })
      .eq("registration_id", sent);

    expect((await cancel(unsent)).error).toBeNull();
    expect((await cancel(sent)).error).toBeNull();

    const { data: codes } = await adminClient
      .from("discount_codes")
      .select("registration_id, sent_at")
      .eq("event_id", eventId);
    expect(codes!.find((code) => code.sent_at === null)!.registration_id).toBe(
      null,
    );
    expect(codes!.find((code) => code.sent_at !== null)!.registration_id).toBe(
      sent,
    );

    // The undo reserves one again from the pool.
    expect((await restore(unsent)).error).toBeNull();
    const { data: reassigned } = await adminClient
      .from("discount_codes")
      .select("id")
      .eq("registration_id", unsent);
    expect(reassigned).toHaveLength(1);
  });

  test("refuses a checked-in registration, and check-in refuses a cancelled one", async () => {
    const eventId = await event();
    const checkedIn = await registered(eventId, 1);
    await adminClient
      .from("event_registrations")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", checkedIn);
    expect((await cancel(checkedIn)).error?.message).toBe(
      "REGISTRATION_CHECKED_IN",
    );

    const cancelled = await registered(eventId, 1);
    expect((await cancel(cancelled)).error).toBeNull();
    const { error } = await adminClient
      .from("event_registrations")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", cancelled);
    expect(error?.code).toBe("23514");
  });

  test("needs events: manage", async () => {
    const eventId = await event();
    const id = await registered(eventId, 1);
    const volunteer = await signIn(SEEDED_USERS.volunteer);
    expect((await cancel(id, volunteer)).error).not.toBeNull();
    expect((await registration(id)).cancelled_at).toBeNull();
  });

  test("refuses a reason that is not one of the four", async () => {
    const eventId = await event();
    const id = await registered(eventId, 1);
    expect((await cancel(id, adminClient, "bored")).error?.message).toBe(
      "CANCELLATION_REASON_INVALID",
    );
  });
});

describe("a registrant cancelling their own registration", () => {
  test("cancels it as not_attending, and can register again", async () => {
    const eventId = await event();
    const { client, userId } = await constituent();
    const id = await registerMyself(client, eventId);

    const { error } = await client.rpc("cancel_my_event_registration", {
      p_registration_id: id,
    });
    expect(error).toBeNull();
    const row = await registration(id);
    expect(row.cancellation_reason).toBe("not_attending");
    expect(row.cancelled_by).toBe(userId);

    // No longer "you're registered", and the one-per-person rule counts only
    // active registrations.
    const { data: mine } = await client.rpc("my_event_registration", {
      p_event_id: eventId,
    });
    expect(mine).toEqual([]);
    const again = await registerMyself(client, eventId);
    expect(again).not.toBe(id);
  });

  test("cannot cancel somebody else's", async () => {
    const eventId = await event();
    const owner = await constituent();
    const other = await constituent();
    const id = await registerMyself(owner.client, eventId);

    const { error } = await other.client.rpc("cancel_my_event_registration", {
      p_registration_id: id,
    });
    expect(error?.message).toBe("REGISTRATION_NOT_FOUND");
    expect((await registration(id)).cancelled_at).toBeNull();

    // An anonymous caller cannot reach the function at all.
    const { error: anonError } = await anon.rpc(
      "cancel_my_event_registration",
      { p_registration_id: id },
    );
    expect(anonError).not.toBeNull();
  });

  test("cannot cancel once the event has started", async () => {
    const eventId = await event({
      startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const { client } = await constituent();
    const id = await registerMyself(client, eventId);

    const { error } = await client.rpc("cancel_my_event_registration", {
      p_registration_id: id,
    });
    expect(error?.message).toBe("EVENT_ALREADY_STARTED");
    expect((await registration(id)).cancelled_at).toBeNull();
  });
});
