// Integration test: exercises the real registerForEventAction against a
// real local Supabase stack (register_for_event RPC, RLS, rate limiting).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  countEventRegistrations,
  createPerson,
  createPublishedEvent,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
  revalidatePathMock.mockClear();
});

async function event(overrides?: Parameters<typeof createPublishedEvent>[0]) {
  const fixture = await createPublishedEvent(overrides);
  cleanups.push(fixture.cleanup);
  return fixture;
}

async function seedDiscountCodes(eventId: string, count: number) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const { error } = await adminClient.from("discount_codes").insert(
    Array.from({ length: count }, (_, i) => ({
      event_id: eventId,
      code: `AUTO-${suffix}-${i}`,
    })),
  );
  if (error) throw error;
}

async function assignedRegistrationIds(eventId: string) {
  const { data, error } = await adminClient
    .from("discount_codes")
    .select("registration_id")
    .eq("event_id", eventId)
    .not("registration_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((row) => row.registration_id as string);
}

async function registrationFor(eventId: string, email: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .select("id, person_id, pronouns")
    .eq("event_id", eventId)
    .ilike("email", email)
    .single();
  if (error) throw error;
  return data;
}

async function personPronouns(personId: string) {
  const { data, error } = await adminClient
    .from("people")
    .select("pronouns")
    .eq("id", personId)
    .single();
  if (error) throw error;
  return data.pronouns as string | null;
}

describe("registerForEventAction (integration)", () => {
  test("registers for a published, open event", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("happy-path");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email, partySize: "2" }),
    );

    expect(result).toMatchObject({ success: true });
    // The registration id is handed back so the rider-profile follow-up
    // step can authorize its own write (#564).
    expect("success" in result && result.registrationId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(await countEventRegistrations(id, email)).toBe(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/events");
  });

  test("stores pronouns on the registration and on the new person record", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("pronouns-new");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email, pronouns: "  they/them  " }),
    );
    expect(result).toMatchObject({ success: true });

    const registration = await registrationFor(id, email);
    // Runs before the event's own cleanup pops, so the registration has to go
    // first -- event_registrations.person_id still references this row.
    cleanups.push(async () => {
      const personId = registration.person_id as string;
      await adminClient
        .from("event_registrations")
        .delete()
        .eq("person_id", personId);
      await adminClient.from("people").delete().eq("id", personId);
    });

    expect(registration.pronouns).toBe("they/them");
    expect(await personPronouns(registration.person_id as string)).toBe(
      "they/them",
    );
  });

  test("fills a blank on an existing person but never overwrites one", async () => {
    currentIp = uniqueIp();
    const email = uniqueEmail("pronouns-existing");
    const person = await createPerson({ email });
    cleanups.push(person.cleanup);

    const first = await event();
    expect(
      await registerForEventAction(
        first.id,
        formData({ name: "Jamie Rivera", email, pronouns: "she/her" }),
      ),
    ).toMatchObject({ success: true });
    expect(await personPronouns(person.id)).toBe("she/her");

    // A second registration carrying something else -- a stale autofill, or a
    // different person sharing the address -- must not rewrite the record.
    const second = await event();
    expect(
      await registerForEventAction(
        second.id,
        formData({ name: "Jamie Rivera", email, pronouns: "he/him" }),
      ),
    ).toMatchObject({ success: true });

    expect(await personPronouns(person.id)).toBe("she/her");
    // The registration still snapshots what was submitted on the day.
    expect((await registrationFor(second.id, email)).pronouns).toBe("he/him");
  });

  test("rejects when registration is closed", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ registration_enabled: false });
    const email = uniqueEmail("closed");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({
      error: "Registration is not open for this event.",
    });
    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  test("rejects after the registration deadline has passed", async () => {
    currentIp = uniqueIp();
    const { id } = await event({
      registration_deadline: new Date(Date.now() - 60_000).toISOString(),
    });
    const email = uniqueEmail("deadline");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({
      error: "The registration deadline for this event has passed.",
    });
  });

  test("rejects once the event is at capacity", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ capacity: 2 });
    const firstEmail = uniqueEmail("capacity-1");
    const secondEmail = uniqueEmail("capacity-2");

    const first = await registerForEventAction(
      id,
      formData({ name: "First Registrant", email: firstEmail, partySize: "2" }),
    );
    expect(first).toMatchObject({ success: true });

    const second = await registerForEventAction(
      id,
      formData({
        name: "Second Registrant",
        email: secondEmail,
        partySize: "1",
      }),
    );
    expect(second).toEqual({ error: "This event has reached capacity." });
    expect(await countEventRegistrations(id, secondEmail)).toBe(0);
  });

  test("rejects a duplicate registration for the same event and email", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("duplicate");

    const first = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );
    expect(first).toMatchObject({ success: true });

    const second = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email: email.toUpperCase() }),
    );
    expect(second).toEqual({
      error: "This email is already registered for this event.",
    });
    expect(await countEventRegistrations(id, email)).toBe(1);
  });

  test("reports EVENT_NOT_FOUND for a private/unpublished event", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ visibility: "private" });
    const email = uniqueEmail("not-found");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({ error: "This event could not be found." });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("honeypot");

    const result = await registerForEventAction(
      id,
      formData({ name: "A Bot", email, company: "Definitely A Company" }),
    );

    // The RPC reports fake success to avoid tipping off bots, but no row is
    // actually inserted -- only a DB check can catch a regression here.
    expect(result).toMatchObject({ success: true });
    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  test("rate-limits repeated registrations from the same IP", async () => {
    currentIp = uniqueIp();
    const { id } = await event();

    for (let i = 0; i < 8; i++) {
      const result = await registerForEventAction(
        id,
        formData({
          name: "Repeat Registrant",
          email: uniqueEmail(`rate-${i}`),
        }),
      );
      expect(result).toMatchObject({ success: true });
    }

    const limited = await registerForEventAction(
      id,
      formData({ name: "Repeat Registrant", email: uniqueEmail("rate-9") }),
    );
    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
  });

  test("reserves a code from the batch when auto-assign is on", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ auto_assign_discount_codes: true });
    await seedDiscountCodes(id, 1);
    const email = uniqueEmail("auto-assign");

    const result = await registerForEventAction(
      id,
      formData({ name: "Auto Assignee", email }),
    );
    expect(result).toMatchObject({ success: true });
    expect(await assignedRegistrationIds(id)).toHaveLength(1);
  });

  test("leaves registrations uncoded once the batch is exhausted", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ auto_assign_discount_codes: true });
    await seedDiscountCodes(id, 1);

    const first = await registerForEventAction(
      id,
      formData({ name: "First Registrant", email: uniqueEmail("exhaust-1") }),
    );
    expect(first).toMatchObject({ success: true });

    const second = await registerForEventAction(
      id,
      formData({ name: "Second Registrant", email: uniqueEmail("exhaust-2") }),
    );
    // No error and no waitlist -- the second registrant just gets no code.
    expect(second).toMatchObject({ success: true });
    expect(await assignedRegistrationIds(id)).toHaveLength(1);
  });

  test("never double-reserves a code under concurrent registrations", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ auto_assign_discount_codes: true });
    await seedDiscountCodes(id, 2);

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        registerForEventAction(
          id,
          formData({
            name: `Concurrent Registrant ${i}`,
            email: uniqueEmail(`concurrent-${i}`),
          }),
        ),
      ),
    );
    for (const result of results) {
      expect(result).toMatchObject({ success: true });
    }

    const assignedIds = await assignedRegistrationIds(id);
    expect(assignedIds).toHaveLength(2);
    expect(new Set(assignedIds).size).toBe(2);
  });

  test("does not reserve a code when auto-assign is off", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ auto_assign_discount_codes: false });
    await seedDiscountCodes(id, 1);

    const result = await registerForEventAction(
      id,
      formData({ name: "Manual Only", email: uniqueEmail("manual-only") }),
    );
    expect(result).toMatchObject({ success: true });
    expect(await assignedRegistrationIds(id)).toHaveLength(0);
  });
});
