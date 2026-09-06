// Integration test: exercises getMyActiveEvents against a real local
// Supabase stack. Covers the issue #418 change (surfacing an event's
// capacity so the Happening Now check-in quick action can show it) and the
// issue #429 change (surfacing every active event to callers with
// events:manage, not just ones the person is rostered on via
// event_volunteers), on top of the existing today/in-progress windowing.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createAvailableGearItems,
  createCalendarItem,
  createPerson,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
  unprivilegedActors,
} from "../../../../../test/integration-setup";
import {
  getContentWorkSummary,
  getInventorySummary,
  getMyActiveEvents,
  getUpcomingSummary,
} from "./queries";

async function addVolunteer(eventId: string, personId: string) {
  const { error } = await adminClient
    .from("event_volunteers")
    .insert({ event_id: eventId, person_id: personId });
  if (error) throw error;
}

describe("getMyActiveEvents (integration)", () => {
  test("includes the event's capacity for a today event the person volunteers for", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
      timezone: "UTC",
      capacity: 75,
    });
    await addVolunteer(event.id, person.id);

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
    );

    const found = active.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.capacity).toBe(75);

    await event.cleanup();
    await person.cleanup();
  });

  test("passes through a null capacity", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
      timezone: "UTC",
      capacity: null,
    });
    await addVolunteer(event.id, person.id);

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
    );

    const found = active.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.capacity).toBeNull();

    await event.cleanup();
    await person.cleanup();
  });

  test("excludes events more than two days away from the given time", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      timezone: "UTC",
    });
    await addVolunteer(event.id, person.id);

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
    );

    expect(active.some((e) => e.id === event.id)).toBe(false);

    await event.cleanup();
    await person.cleanup();
  });

  test("does not surface an active event to a non-manager who isn't rostered on it (#429)", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
    });

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
      false,
    );

    expect(active.some((e) => e.id === event.id)).toBe(false);

    await event.cleanup();
    await person.cleanup();
  });

  test("surfaces an active event to a manager who isn't rostered on it (#429)", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
      timezone: "UTC",
      capacity: 40,
    });

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
      true,
    );

    const found = active.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.capacity).toBe(40);

    await event.cleanup();
    await person.cleanup();
  });

  test("surfaces manager events even with no signed-in personId (#429)", async () => {
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
    });

    const active = await getMyActiveEvents(
      adminClient,
      null,
      new Date().toISOString(),
      true,
    );

    expect(active.some((e) => e.id === event.id)).toBe(true);

    await event.cleanup();
  });

  test("dedupes an event the manager is also personally rostered on (#429)", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
    });
    await addVolunteer(event.id, person.id);

    const active = await getMyActiveEvents(
      adminClient,
      person.id,
      new Date().toISOString(),
      true,
    );

    expect(active.filter((e) => e.id === event.id)).toHaveLength(1);

    await event.cleanup();
    await person.cleanup();
  });

  test("still applies the +/-2 day window to the manager branch (#429)", async () => {
    const event = await createPublishedEvent({
      startsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const active = await getMyActiveEvents(
      adminClient,
      null,
      new Date().toISOString(),
      true,
    );

    expect(active.some((e) => e.id === event.id)).toBe(false);

    await event.cleanup();
  });
});

// None of the dashboard's query module carries a checkPermission call: the
// page decides which sections to render and each query trusts RLS for the
// rows behind them. Everything above runs as admin, so nothing here proved
// that second half held (#746). These cases fix that -- with the fixtures
// created first and the privileged figures asserted non-zero, so an
// unprivileged zero can't be a vacuously empty database.
async function seedUpcomingFixture() {
  // An hour out, not `now`: getUpcomingSummary filters on
  // `.gte("starts_at", nowIso)`, and the caller's nowIso is taken after these
  // inserts have round-tripped -- an event stamped `now` here sorts behind it
  // and the whole fixture drops out of the summary it is meant to prove.
  const event = await createPublishedEvent({
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    timezone: "UTC",
  });
  const person = await createPerson();
  const registration = await adminClient.from("event_registrations").insert({
    event_id: event.id,
    name: "Integration Test Registrant",
    email: uniqueEmail("dashboard-registrant"),
    party_size: 3,
  });
  if (registration.error) throw registration.error;
  const signup = await adminClient
    .from("event_volunteers")
    .insert({ event_id: event.id, person_id: person.id });
  if (signup.error) throw signup.error;
  const sponsor = await adminClient.from("event_sponsors").insert({
    event_id: event.id,
    person_id: person.id,
    support_type: "cash",
  });
  if (sponsor.error) throw sponsor.error;

  return {
    event,
    person,
    async cleanup() {
      await event.cleanup();
      await person.cleanup();
    },
  };
}

describe("getUpcomingSummary for unprivileged actors (integration)", () => {
  test("a session that can't read events gets a null next event and zero counts", async () => {
    // Deltas against a before/after baseline rather than `> 0`: seed data
    // already supplies upcoming events, so only the change proves the
    // privileged session actually reads the rows the zeros below are about.
    const nowIso = new Date().toISOString();
    const before = await getUpcomingSummary(adminClient, nowIso);
    const fixture = await seedUpcomingFixture();

    const privileged = await getUpcomingSummary(adminClient, nowIso);
    expect(privileged.registrationCount).toBe(before.registrationCount + 3);
    expect(privileged.volunteerCount).toBe(before.volunteerCount + 1);
    expect(privileged.partnerCount).toBe(before.partnerCount + 1);
    expect(privileged.nextEvent).not.toBeNull();

    for (const { name, client } of await unprivilegedActors()) {
      if (name === "volunteer") continue; // holds events:view -- see below
      const result = await getUpcomingSummary(client, nowIso);
      expect({ actor: name, ...result }).toEqual({
        actor: name,
        nextEvent: null,
        registrationCount: 0,
        volunteerCount: 0,
        partnerCount: 0,
      });
    }

    await fixture.cleanup();
  });

  // The dashboard's canSeeUpcoming is exactly events:view (home/page.tsx),
  // which the volunteer role holds, so this whole section -- registrant head
  // count and partner count included -- is meant to reach it. Pinned, not
  // endorsed: narrowing either the role grant or the `events` policies should
  // fail here and be updated deliberately.
  test("the volunteer role sees the same upcoming figures as admin (events:view)", async () => {
    const nowIso = new Date().toISOString();
    const before = await getUpcomingSummary(adminClient, nowIso);
    const fixture = await seedUpcomingFixture();

    const privileged = await getUpcomingSummary(adminClient, nowIso);
    expect(privileged.registrationCount).toBe(before.registrationCount + 3);

    const volunteerView = await getUpcomingSummary(
      await signInAs(SEEDED_USERS.volunteer),
      nowIso,
    );
    expect(volunteerView).toEqual(privileged);

    await fixture.cleanup();
  });
});

describe("getInventorySummary for unprivileged actors (integration)", () => {
  test("returns zeroes for every unprivileged session, volunteer included", async () => {
    const gear = await createAvailableGearItems(2);

    const privileged = await getInventorySummary(adminClient);
    expect(privileged.totalItems).toBeGreaterThan(0);
    expect(privileged.itemsAvailable).toBeGreaterThan(0);

    // inventory_intake:manage (which volunteer holds, for donation intake)
    // deliberately does not widen the inventory_items select policy, so
    // unlike the events section there is no by-design exception here.
    for (const { name, client } of await unprivilegedActors()) {
      expect({ actor: name, ...(await getInventorySummary(client)) }).toEqual({
        actor: name,
        totalItems: 0,
        itemsAvailable: 0,
        itemsDistributed: 0,
        itemsNeedingAttention: 0,
      });
    }

    await gear.cleanup();
  });
});

describe("getMyActiveEvents for unprivileged actors (integration)", () => {
  test("returns nothing even with the manage flag forced on", async () => {
    const person = await createPerson();
    const event = await createPublishedEvent({
      startsAt: new Date().toISOString(),
      timezone: "UTC",
    });
    const signup = await adminClient
      .from("event_volunteers")
      .insert({ event_id: event.id, person_id: person.id });
    if (signup.error) throw signup.error;
    const nowIso = new Date().toISOString();

    expect(
      (await getMyActiveEvents(adminClient, person.id, nowIso, true)).some(
        (e) => e.id === event.id,
      ),
    ).toBe(true);

    // hasManagePermission is derived from the caller's permissions on the
    // page; passing true here asks whether RLS alone would still hold if that
    // derivation were ever wrong.
    for (const { name, client } of await unprivilegedActors()) {
      if (name === "volunteer") continue; // holds events:view
      const active = await getMyActiveEvents(client, person.id, nowIso, true);
      expect({ actor: name, events: active }).toEqual({
        actor: name,
        events: [],
      });
    }

    await event.cleanup();
    await person.cleanup();
  });
});

describe("getContentWorkSummary for unprivileged actors (integration)", () => {
  test("returns no items for a session without content_calendar access", async () => {
    // A Tier 1 item with no decision recorded: the one content-work count
    // that doesn't depend on who owns the opportunity.
    const item = await createCalendarItem({ priorityTier: 1 });
    const person = await createPerson();
    const options = {
      canSeeContentCalendar: true,
      personId: person.id,
    };

    const privileged = await getContentWorkSummary(adminClient, options);
    expect(
      privileged.items.some((i) => i.key === "content_tier1_undecided"),
    ).toBe(true);

    // canSeeContentCalendar forced true for the same reason as above: the
    // question is what RLS returns when the page-level gate is out of the way.
    for (const { name, client } of await unprivilegedActors()) {
      if (name === "volunteer") continue; // holds content_calendar:view
      expect({
        actor: name,
        ...(await getContentWorkSummary(client, options)),
      }).toEqual({ actor: name, items: [] });
    }

    await item.cleanup();
    await person.cleanup();
  });
});
