// Integration test for #1589 against a real local Supabase stack: the event's
// one shared code, which is never assigned (by hand or by auto-assign); PINs;
// option prices copied onto count rows; the options a code covers; and what
// the impact RPC returns for the discount value offered.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  assignDiscountCodeAction,
  createDiscountCodesAction,
  createSharedDiscountCodeAction,
  listDiscountCodesAction,
  updateDiscountCodeAction,
} = await import("./discount-codes-actions");

const service = serviceRoleClient();
const anon = anonClient();
const run = crypto.randomUUID().slice(0, 8);
const cleanups: (() => Promise<void>)[] = [];
const registeredEmails: string[] = [];

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  for (let i = 0; i < registeredEmails.length; i += 50) {
    await service
      .from("people")
      .delete()
      .in("email", registeredEmails.slice(i, i + 50));
  }
});

async function event(autoAssign = false) {
  const fixture = await createPublishedEvent({
    name: `Shared codes ${run}`,
    auto_assign_discount_codes: autoAssign,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

/** Chatter Snow's question: own gear (no price), a ticket, ticket and gear. */
async function eventWithPricedOptions(autoAssign = false) {
  const eventId = await event(autoAssign);
  const { error } = await adminClient.rpc("save_event_registration_options", {
    p_event_id: eventId,
    p_prompt: "What do you need?",
    p_options: [
      { label: "I'll use my own", cap: null, price: null },
      { label: "I need a ticket", cap: null, price: 80 },
      { label: "I need a ticket and gear", cap: null, price: 130 },
    ],
  });
  if (error) throw error;
  const { data, error: readError } = await adminClient
    .from("event_registration_options")
    .select("id, price")
    .eq("event_id", eventId)
    .order("sort_order");
  if (readError) throw readError;
  const [own, ticket, bundle] = data.map((row) => row.id as string);
  return { eventId, own, ticket, bundle };
}

async function register(
  eventId: string,
  partySize: number,
  counts?: Record<string, number>,
) {
  const email = uniqueEmail(`shared-codes-${run}`);
  registeredEmails.push(email);
  const { data, error } = await anon.rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Shared Code Tester",
    p_email: email,
    p_phone: "",
    p_party_size: partySize,
    p_notes: "",
    p_ip_address: uniqueIp(),
    p_option_counts: counts,
  });
  if (error) throw error;
  return data as string;
}

function sharedForm(code: string, fields: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("code", code);
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function codesOf(eventId: string) {
  const listed = await listDiscountCodesAction(eventId);
  if (!("data" in listed)) throw new Error(listed.error);
  return listed.data;
}

describe("shared discount codes (integration)", () => {
  test("an event holds at most one shared code", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const eventId = await event();

    expect(
      await createSharedDiscountCodeAction(
        eventId,
        sharedForm(`GROUP-${run}`, { pin: "7731" }),
      ),
    ).toEqual({ success: true });
    expect(
      await createSharedDiscountCodeAction(
        eventId,
        sharedForm(`GROUP-${run}-2`),
      ),
    ).toEqual({
      error: "This event already has a shared code. Edit that one instead.",
    });

    // The index, not just the action, refuses it.
    const direct = await adminClient
      .from("discount_codes")
      .insert({ event_id: eventId, code: `GROUP-${run}-3`, shared: true });
    expect(direct.error?.code).toBe("23505");

    const [shared] = await codesOf(eventId);
    expect(shared).toMatchObject({ shared: true, pin: "7731" });
  });

  test("a shared code can't be assigned, by the action or directly", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const eventId = await event();
    const registrationId = await register(eventId, 1);
    await createSharedDiscountCodeAction(eventId, sharedForm(`G-${run}`));
    const [shared] = await codesOf(eventId);

    expect(await assignDiscountCodeAction(shared.id, registrationId)).toEqual({
      error:
        "The shared code goes to everyone who registers, so it can't be assigned.",
    });
    const direct = await adminClient
      .from("discount_codes")
      .update({ registration_id: registrationId })
      .eq("id", shared.id);
    expect(direct.error?.code).toBe("23514");
  });

  test("auto-assign skips the shared code for the next single-use one", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const eventId = await event(true);
    // Created first, so an unfiltered "oldest unassigned" would pick it.
    await createSharedDiscountCodeAction(eventId, sharedForm(`G-${run}`));
    const batch = new FormData();
    batch.set("codes", `SINGLE-${run}, 4821`);
    expect(await createDiscountCodesAction(eventId, batch)).toEqual({
      success: true,
    });

    const registrationId = await register(eventId, 1);
    const codes = await codesOf(eventId);
    const shared = codes.find((code) => code.shared)!;
    const single = codes.find((code) => !code.shared)!;
    expect(shared.registration_id).toBeNull();
    expect(single).toMatchObject({
      registration_id: registrationId,
      pin: "4821",
    });

    // A second registrant finds no single-use code left, and still not the
    // shared one.
    await register(eventId, 1);
    const after = await codesOf(eventId);
    expect(after.find((code) => code.shared)!.registration_id).toBeNull();
  });

  test("a code may only cover its own event's options", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const first = await eventWithPricedOptions();
    const other = await eventWithPricedOptions();
    await createSharedDiscountCodeAction(
      first.eventId,
      sharedForm(`G-${run}`, { [`percentOff.${first.ticket}`]: "50" }),
    );
    const [shared] = await codesOf(first.eventId);
    expect(shared.coverage).toEqual([
      { option_id: first.ticket, percent_off: 50 },
    ]);

    const fd = new FormData();
    fd.set(`percentOff.${other.ticket}`, "50");
    expect(await updateDiscountCodeAction(shared.id, fd)).toEqual({
      error:
        "The code was saved, but not the options it covers. Edit it to try again.",
    });
  });
});

describe("option prices (integration)", () => {
  test("a count row keeps the price it was registered at", async () => {
    const { eventId, ticket, bundle } = await eventWithPricedOptions();
    const registrationId = await register(eventId, 3, {
      [ticket]: 2,
      [bundle]: 1,
    });

    // The price changes after they registered.
    const { data: options } = await adminClient
      .from("event_registration_options")
      .select("id, label, cap")
      .eq("event_id", eventId)
      .order("sort_order");
    const { error } = await adminClient.rpc("save_event_registration_options", {
      p_event_id: eventId,
      p_prompt: "What do you need?",
      p_options: (options ?? []).map((option) => ({
        ...option,
        price: option.id === ticket ? 95 : option.id === bundle ? 150 : null,
      })),
    });
    expect(error).toBeNull();

    const prices = async () => {
      const { data } = await adminClient
        .from("event_registration_option_counts")
        .select("option_id, price")
        .eq("registration_id", registrationId)
        .order("sort_order");
      return data;
    };
    expect(await prices()).toEqual([
      { option_id: ticket, price: 80 },
      { option_id: bundle, price: 130 },
    ]);

    // Staff changing the answer keeps the copied price for an option it
    // already held, and copies today's price for a new one.
    const { error: setError } = await adminClient.rpc(
      "set_registrant_option_counts",
      {
        p_registration_id: registrationId,
        p_counts: { [ticket]: 3 },
      },
    );
    expect(setError).toBeNull();
    expect(await prices()).toEqual([{ option_id: ticket, price: 80 }]);
    const { error: againError } = await adminClient.rpc(
      "set_registrant_option_counts",
      {
        p_registration_id: registrationId,
        p_counts: { [ticket]: 2, [bundle]: 1 },
      },
    );
    expect(againError).toBeNull();
    expect(await prices()).toEqual([
      { option_id: ticket, price: 80 },
      { option_id: bundle, price: 150 },
    ]);
  });

  test("refuses a negative price or one finer than a cent", async () => {
    const eventId = await event();
    for (const price of [-1, 80.005]) {
      const { error } = await adminClient.rpc(
        "save_event_registration_options",
        {
          p_event_id: eventId,
          p_prompt: "What do you need?",
          p_options: [{ label: "Ticket", cap: null, price }],
        },
      );
      expect(error?.message).toBe("EVENT_OPTIONS_INVALID");
    }
  });
});

describe("discount value offered data (integration)", () => {
  test("returns shared and held codes with coverage, and live priced answers", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const { eventId, ticket, bundle, own } = await eventWithPricedOptions();
    await createSharedDiscountCodeAction(
      eventId,
      sharedForm(`G-${run}`, {
        [`percentOff.${ticket}`]: "50",
        [`percentOff.${bundle}`]: "50",
      }),
    );
    const kept = await register(eventId, 2, { [ticket]: 1, [own]: 1 });
    const cancelled = await register(eventId, 1, { [bundle]: 1 });
    const { error: cancelError } = await adminClient.rpc(
      "cancel_event_registration",
      {
        p_registration_id: cancelled,
        p_reason: "not_attending",
        p_note: "",
      },
    );
    expect(cancelError).toBeNull();

    const { data, error } = await adminClient.rpc(
      "get_event_impact_derived_data",
      { p_event_id: eventId },
    );
    expect(error).toBeNull();
    expect(data.offered_codes).toHaveLength(1);
    expect(data.offered_codes[0]).toMatchObject({
      shared: true,
      registration_id: null,
    });
    expect(
      [...data.offered_codes[0].options].sort(
        (a: { price: number }, b: { price: number }) => a.price - b.price,
      ),
    ).toEqual([
      { option_id: ticket, percent_off: 50, price: 80 },
      { option_id: bundle, percent_off: 50, price: 130 },
    ]);
    // The cancelled party's answer is gone; the kept one is at its price.
    expect(
      data.option_counts.every(
        (row: { registration_id: string }) => row.registration_id === kept,
      ),
    ).toBe(true);
    expect(data.option_counts).toHaveLength(2);
  });
});
