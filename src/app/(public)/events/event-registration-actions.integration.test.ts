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
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import { EVENT_REGISTRATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

// The action schedules the registrant's confirmation with after() (#1068).
// This file imports the action directly, so there is no request scope and
// Next's real after() would throw -- and the sender it schedules imports
// "server-only", which throws outside Next's bundler. Everything else in
// next/server is kept, so the mock cannot surprise another file sharing this
// process. Same shape as gear-cart-request-actions.integration.test.ts.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

const { registerForEventAction } = await import("./event-registration-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
const service = serviceRoleClient();

afterEach(async () => {
  // Let the scheduled confirmation settle before the fixtures it reads go
  // away. RESEND_API_KEY is unset here, so nothing leaves the building.
  await Promise.all(afterTasks.splice(0));
  // Only the service role may write this table -- `authenticated` has select
  // and no delete policy at all (20260906140000).
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", EVENT_REGISTRATION_CONFIRMATION_KIND);
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
    .select(
      "id, person_id, pronouns, attended_before, waiver_accepted_at, waiver_version",
    )
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
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/e/${id}`);
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

  // #686 --------------------------------------------------------------------
  //
  // A waiver is adopted by two rows that only publish_site_content() writes
  // together: the text in site_content, and a version in
  // legal_document_versions. Written by hand here for the same reason the
  // legal-publication specs do it -- publishing through the portal needs a
  // signed-in admin and a draft, and what is under test is what the
  // registration RPC does with the result.

  async function adoptWaiver(version = 1) {
    const tenantId = await defaultTenantId();
    await service.from("site_content").upsert(
      {
        tenant_id: tenantId,
        key: "legal.waiver",
        value: {
          title: "Participant Waiver",
          last_updated: "September 22, 2026",
          summary: [],
          sections: [
            { id: "risks", title: "Risks", paragraphs: ["Snow is slippery."] },
          ],
        },
        published_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,key" },
    );
    await service.from("legal_document_versions").insert({
      tenant_id: tenantId,
      document: "waiver",
      version,
      content: {
        title: "Participant Waiver",
        last_updated: "x",
        summary: [],
        sections: [],
      },
      effective_at: new Date().toISOString(),
      time_zone: "UTC",
    });
    await service
      .from("app_settings")
      .upsert(
        { tenant_id: tenantId, key: "legal_publication.waiver", value: true },
        { onConflict: "tenant_id,key" },
      );

    cleanups.push(async () => {
      await service
        .from("app_settings")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("key", "legal_publication.waiver");
      await service
        .from("legal_document_versions")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("document", "waiver");
      await service
        .from("site_content")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("key", "legal.waiver");
    });
  }

  async function defaultTenantId() {
    const { data, error } = await service
      .from("tenants")
      .select("id")
      .eq("slug", "example-nonprofit")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  test("records nothing about a waiver when the tenant has adopted none", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("waiver-none");

    expect(
      await registerForEventAction(id, formData({ name: "Jamie", email })),
    ).toMatchObject({ success: true });

    const registration = await registrationFor(id, email);
    // Both null, and that means "nothing was asked" -- never "they declined".
    expect(registration.waiver_accepted_at).toBeNull();
    expect(registration.waiver_version).toBeNull();
  });

  test("refuses a registration that did not accept an adopted waiver", async () => {
    currentIp = uniqueIp();
    await adoptWaiver();
    const { id } = await event();
    const email = uniqueEmail("waiver-refused");

    expect(
      await registerForEventAction(id, formData({ name: "Jamie", email })),
    ).toMatchObject({ error: expect.stringContaining("tick the box") });

    // And the refusal writes nothing: a declined waiver leaves no row to read
    // a decline off, which is why null can only mean "not asked".
    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  test("stores the version accepted", async () => {
    currentIp = uniqueIp();
    await adoptWaiver(3);
    const { id } = await event();
    const email = uniqueEmail("waiver-accepted");

    expect(
      await registerForEventAction(
        id,
        formData({
          name: "Jamie",
          email,
          waiverAccepted: "on",
          waiverVersion: "3",
        }),
      ),
    ).toMatchObject({ success: true });

    const registration = await registrationFor(id, email);
    expect(registration.waiver_version).toBe(3);
    expect(registration.waiver_accepted_at).not.toBeNull();
  });

  // The version the reader was shown is compared, never stored. A republish
  // between render and submit is a different document, and recording
  // acceptance of text nobody read is the failure the pointer exists to
  // prevent.
  test("refuses a submission made against a version no longer in force", async () => {
    currentIp = uniqueIp();
    await adoptWaiver(2);
    const { id } = await event();
    const email = uniqueEmail("waiver-stale");

    expect(
      await registerForEventAction(
        id,
        formData({
          name: "Jamie",
          email,
          waiverAccepted: "on",
          waiverVersion: "1",
        }),
      ),
    ).toMatchObject({ error: expect.stringContaining("was updated") });

    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  // In force with nothing to point at. The portal refuses to create this, so
  // reaching it means a direct write -- and taking a registration without the
  // waiver the organization said governs taking part is the wrong way to fail.
  test("refuses when a waiver is in force but no version exists", async () => {
    currentIp = uniqueIp();
    const tenantId = await defaultTenantId();
    await service
      .from("app_settings")
      .upsert(
        { tenant_id: tenantId, key: "legal_publication.waiver", value: true },
        { onConflict: "tenant_id,key" },
      );
    cleanups.push(async () => {
      await service
        .from("app_settings")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("key", "legal_publication.waiver");
    });

    const { id } = await event();
    const email = uniqueEmail("waiver-unavailable");

    expect(
      await registerForEventAction(
        id,
        formData({ name: "Jamie", email, waiverAccepted: "on" }),
      ),
    ).toMatchObject({ error: expect.stringContaining("could not be loaded") });

    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  // #1259 -------------------------------------------------------------------

  test("stores the been-before answer on the registration", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("been-before-yes");

    expect(
      await registerForEventAction(
        id,
        formData({ name: "Jamie Rivera", email, attendedBefore: "yes" }),
      ),
    ).toMatchObject({ success: true });

    expect((await registrationFor(id, email)).attended_before).toBe(true);
  });

  test("stores a first-timer's answer as false, not as unanswered", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("been-before-no");

    expect(
      await registerForEventAction(
        id,
        formData({ name: "Jamie Rivera", email, attendedBefore: "no" }),
      ),
    ).toMatchObject({ success: true });

    expect((await registrationFor(id, email)).attended_before).toBe(false);
  });

  test("leaves the answer null when the question was not answered", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("been-before-skipped");

    expect(
      await registerForEventAction(
        id,
        formData({ name: "Jamie Rivera", email }),
      ),
    ).toMatchObject({ success: true });

    // Null, and nothing downstream may read it as "no". Before this shipped
    // every row on every event looks exactly like this one.
    expect((await registrationFor(id, email)).attended_before).toBe(null);
  });

  // The enumeration guard, stated as a test: the RPC does the same thing with
  // the answer whether the address already has a `people` row or mints one.
  // Anything that varied here would leak whether the organization holds a
  // record of an address to anybody who can post a form (§5.23).
  test("handles the answer identically for a matched and an unmatched address", async () => {
    currentIp = uniqueIp();
    const known = uniqueEmail("been-before-known");
    const person = await createPerson({ email: known });
    cleanups.push(person.cleanup);
    const unknown = uniqueEmail("been-before-unknown");

    const matched = await event();
    expect(
      await registerForEventAction(
        matched.id,
        formData({ name: "Jamie Rivera", email: known, attendedBefore: "yes" }),
      ),
    ).toMatchObject({ success: true });

    const minted = await event();
    expect(
      await registerForEventAction(
        minted.id,
        formData({
          name: "Sam Okafor",
          email: unknown,
          attendedBefore: "yes",
        }),
      ),
    ).toMatchObject({ success: true });

    const matchedRow = await registrationFor(matched.id, known);
    const mintedRow = await registrationFor(minted.id, unknown);
    expect(matchedRow.attended_before).toBe(true);
    expect(mintedRow.attended_before).toBe(true);
    // The matched one attached to the record that already existed; the minted
    // one got a new person. The answer is the same either way.
    expect(matchedRow.person_id).toBe(person.id);
    expect(mintedRow.person_id).not.toBe(person.id);

    cleanups.push(async () => {
      await adminClient
        .from("event_registrations")
        .delete()
        .eq("id", mintedRow.id as string);
      await adminClient
        .from("people")
        .delete()
        .eq("id", mintedRow.person_id as string);
    });
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

// #748. The capacity check above runs serially: one request finishes before
// the next starts, so the RPC's `sum(party_size)` always sees the finished
// one. The case that actually loses seats is two requests reading that sum
// before either has inserted, which only overlapping promises produce.
describe("registerForEventAction under concurrency", () => {
  // Deleting the `people` rows resolve_or_create_person_by_email() minted
  // behind each registration. Registered as a cleanup *before* the event
  // fixture so it pops last: deleteEvent() has to clear event_registrations
  // first or the FK refuses.
  function cleanUpPeople(emails: string[]) {
    cleanups.push(async () => {
      await adminClient.from("people").delete().in("email", emails);
    });
  }

  test("never seats past capacity when the last seats are claimed at once", async () => {
    currentIp = uniqueIp();
    const emails = Array.from({ length: 4 }, (_, i) =>
      uniqueEmail(`capacity-race-${i}`),
    );
    cleanUpPeople(emails);
    const { id } = await event({ capacity: 2 });

    const results = await Promise.all(
      emails.map((email, i) =>
        registerForEventAction(
          id,
          formData({ name: `Capacity Racer ${i}`, email, partySize: "1" }),
        ),
      ),
    );

    const seated = results.filter((result) => "success" in result);
    const refused = results.filter((result) => "error" in result);
    expect(seated).toHaveLength(2);
    for (const result of refused) {
      expect(result).toEqual({ error: "This event has reached capacity." });
    }

    // The invariant, asserted against the table rather than the return
    // values: capacity is a promise about seats, not about calls.
    const { data, error } = await adminClient
      .from("event_registrations")
      .select("party_size")
      .eq("event_id", id);
    expect(error).toBeNull();
    expect(data!.reduce((sum, row) => sum + row.party_size, 0)).toBe(2);
  });

  // A party larger than the remaining seats must not slip through either:
  // three parties of two against four seats is two winners, not three, and
  // the loser must be the whole party rather than a truncated one.
  test("never admits a party larger than the seats left", async () => {
    currentIp = uniqueIp();
    const emails = Array.from({ length: 3 }, (_, i) =>
      uniqueEmail(`party-race-${i}`),
    );
    cleanUpPeople(emails);
    const { id } = await event({ capacity: 4 });

    const results = await Promise.all(
      emails.map((email, i) =>
        registerForEventAction(
          id,
          formData({ name: `Party Racer ${i}`, email, partySize: "2" }),
        ),
      ),
    );

    expect(results.filter((result) => "success" in result)).toHaveLength(2);

    const { data } = await adminClient
      .from("event_registrations")
      .select("party_size")
      .eq("event_id", id);
    expect(data!.reduce((sum, row) => sum + row.party_size, 0)).toBe(4);
  });
});

// #1068. The action's own half of the confirmation: that it is scheduled at
// all, and against the right person. What the message says is unit-tested.
describe("registerForEventAction confirmation", () => {
  test("schedules one confirmation, ledgered against the registrant", async () => {
    currentIp = uniqueIp();
    const email = uniqueEmail("confirm-registrant");
    // Popped before the event fixture, since deleteEvent() has to clear
    // event_registrations first or the FK refuses. Removing the people row
    // cascades its delivery row away with it.
    cleanups.push(async () => {
      await adminClient.from("people").delete().eq("email", email);
    });
    const { id } = await event();

    const result = await registerForEventAction(
      id,
      formData({ name: "Confirmed Registrant", email }),
    );
    expect(result).toMatchObject({ success: true });

    // The send is scheduled, not awaited: nothing about it may reach the
    // visitor, so it has to be drained before the ledger is read.
    await Promise.all(afterTasks.splice(0));

    const { data: person } = await service
      .from("people")
      .select("id")
      .eq("email", email)
      .single();
    const { data: rows } = await service
      .from("notification_deliveries")
      .select("person_id, dedupe_key, status")
      .eq("kind", EVENT_REGISTRATION_CONFIRMATION_KIND);

    expect(rows).toHaveLength(1);
    expect(rows![0].person_id).toBe(person!.id);
    expect(rows![0].status).toBe("sent");
    expect(rows![0].dedupe_key).toBe(
      `${EVENT_REGISTRATION_CONFIRMATION_KIND}:${(result as { registrationId: string }).registrationId}`,
    );
  });

  test("schedules nothing for a filled honeypot", async () => {
    currentIp = uniqueIp();
    const { id } = await event();

    const result = await registerForEventAction(
      id,
      formData({
        name: "Bot",
        email: uniqueEmail("confirm-honeypot"),
        company: "Acme Spam Co",
      }),
    );
    expect(result).toMatchObject({ success: true });

    await Promise.all(afterTasks.splice(0));

    const { data: rows } = await service
      .from("notification_deliveries")
      .select("id")
      .eq("kind", EVENT_REGISTRATION_CONFIRMATION_KIND);
    expect(rows).toEqual([]);
  });
});

// #1206: parseEventRegistrationForm refuses a blank name, but register_for_event
// is `security definer` and granted to **anon** -- an unauthenticated POST to
// /rest/v1/rpc/register_for_event reached resolve_or_create_person_by_email()
// with a whitespace name and left a people row nobody could identify. These
// call the RPC the way a caller that never loaded the parser does, so the floor
// stays in Postgres: the function's own NAME_REQUIRED, with the tightened
// donor_identified_or_anonymous check behind it for every other writer.
describe("register_for_event name floor (integration)", () => {
  async function registerAs(name: string, email: string) {
    const { id } = await event();
    return anonClient().rpc("register_for_event", {
      p_event_id: id,
      p_name: name,
      p_email: email,
      p_phone: null,
      p_party_size: 1,
      p_notes: null,
      p_ip_address: uniqueIp(),
    });
  }

  test("an empty name is refused for an anonymous caller", async () => {
    const { data, error } = await registerAs("", uniqueEmail("blank-name"));

    expect(data).toBeNull();
    expect(error?.message).toContain("NAME_REQUIRED");
  });

  test("a whitespace-only name is refused for an anonymous caller", async () => {
    const email = uniqueEmail("whitespace-name");
    const { data, error } = await registerAs("   ", email);

    expect(data).toBeNull();
    expect(error?.message).toContain("NAME_REQUIRED");

    // Nothing behind it: neither the person the RPC resolves nor the
    // registration it would have written.
    const { data: people } = await service
      .from("people")
      .select("id")
      .eq("email", email);
    expect(people).toEqual([]);
    const { data: registrations } = await service
      .from("event_registrations")
      .select("id")
      .eq("email", email);
    expect(registrations).toEqual([]);
  });

  test("the constraint refuses a blank name written straight to the table", async () => {
    const { error } = await service.from("people").insert({
      name: "   ",
      is_anonymous: false,
      source_type: "other",
      email: uniqueEmail("direct-blank-name"),
    });

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("donor_identified_or_anonymous");
  });

  test("an anonymous person may still have no name", async () => {
    const { data, error } = await service
      .from("people")
      .insert({ name: null, is_anonymous: true, source_type: "other" })
      .select("id")
      .single();

    expect(error).toBeNull();
    await service.from("people").delete().eq("id", data!.id);
  });
});
