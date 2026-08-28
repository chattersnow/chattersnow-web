// Integration test: exercises getOpsInboxSummary's "awaiting check-in today"
// item (issue #418: one deep-linked item per today's event, rather than a
// single item pointing at the generic events list) against a real local
// Supabase stack (RLS-scoped events/event_registrations selects).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
} from "../../../test/integration-setup";
import { getOpsInboxSummary } from "./attention-items";

async function seedRegistration(eventId: string, checkedIn: boolean) {
  const { error } = await adminClient.from("event_registrations").insert({
    event_id: eventId,
    name: "Integration Test Registrant",
    email: uniqueEmail("registrant"),
    party_size: 1,
    checked_in_at: checkedIn ? new Date().toISOString() : null,
  });
  if (error) throw error;
}

function todayIso() {
  return new Date().toISOString();
}

describe("getOpsInboxSummary event check-ins (integration)", () => {
  test("produces one deep-linked item per today's event with pending check-ins", async () => {
    const eventA = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    const eventB = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(eventA.id, false);
    await seedRegistration(eventA.id, false);
    await seedRegistration(eventB.id, true); // already checked in: not pending
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: true,
    });

    const itemA = result.items.find((item) => item.href.includes(eventA.id));
    expect(itemA).toBeDefined();
    expect(itemA?.count).toBe(2);
    expect(itemA?.label).toBe(`2 awaiting check-in · ${eventA.name}`);
    expect(itemA?.href).toBe(
      `/portal/events?eventId=${eventA.id}&tab=registrants`,
    );

    expect(result.items.some((item) => item.href.includes(eventB.id))).toBe(
      false,
    );

    await eventA.cleanup();
    await eventB.cleanup();
  });

  test("omits an event once every registrant is checked in", async () => {
    const event = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(event.id, true);
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: true,
    });

    expect(result.items.some((item) => item.href.includes(event.id))).toBe(
      false,
    );

    await event.cleanup();
  });

  test("returns no check-in items when the viewer can't see event check-ins", async () => {
    const event = await createPublishedEvent({
      startsAt: todayIso(),
      timezone: "UTC",
    });
    await seedRegistration(event.id, false);
    const supabase = await signInAs(SEEDED_USERS.admin);

    const result = await getOpsInboxSummary(supabase, {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: false,
    });

    expect(result.items.some((item) => item.href.includes(event.id))).toBe(
      false,
    );

    await event.cleanup();
  });
});
