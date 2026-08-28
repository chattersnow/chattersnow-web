// Integration test: exercises getMyActiveEvents against a real local
// Supabase stack. Covers the issue #418 change (surfacing an event's
// capacity so the Happening Now check-in quick action can show it), on top
// of the existing today/in-progress windowing.
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
});
