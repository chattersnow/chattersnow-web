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
  adminClient,
  createPerson,
  createPublishedEvent,
} from "../../../../../test/integration-setup";
import { getMyActiveEvents } from "./queries";

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
