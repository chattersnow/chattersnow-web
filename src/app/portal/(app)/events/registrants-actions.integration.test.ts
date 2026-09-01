// Integration test: exercises the real admin-side registrant Server Actions
// against a real local Supabase stack (checkPermission, then real
// `event_registrations` RLS). Public sign-up goes through the
// register_for_event() RPC (covered by
// src/app/(public)/events/event-registration-actions.integration.test.ts);
// what's covered here is the staff check-in path added in 20260824190000 --
// select on events:view, insert/update on events:manage -- which is the only
// place staff write this table directly.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventRegistrantsAction,
  checkInRegistrantAction,
  undoCheckInAction,
  createWalkInCheckInAction,
  addRegistrantAction,
} = await import("./registrants-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// A pre-existing registration to check in, seeded straight through the
// admin session rather than the public RPC (which adds capacity/deadline
// validation this file isn't about).
async function seedRegistration(eventId: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Integration Test Registrant",
      email: uniqueEmail("registrant"),
      party_size: 2,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function walkInPerson(personId: string) {
  return {
    id: personId,
    name: "Integration Test Walk-in",
    email: uniqueEmail("walkin"),
    phone: null,
  };
}

describe("event registrant check-in actions (integration)", () => {
  test("requires a signed-in user to check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = anonClient();

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      error: "You must be signed in to check in a registrant.",
    });

    await event.cleanup();
  });

  test("admin role (events manage) can list, check in, undo, and add a walk-in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      success: true,
    });

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].checked_in_at).not.toBeNull();

    expect(await undoCheckInAction(registrationId)).toEqual({ success: true });

    const afterUndo = await listEventRegistrantsAction(event.id);
    if (!("data" in afterUndo)) throw new Error("expected data");
    expect(afterUndo.data[0].checked_in_at).toBeNull();

    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 1),
    ).toEqual({ success: true });

    const withWalkIn = await listEventRegistrantsAction(event.id);
    if (!("data" in withWalkIn)) throw new Error("expected data");
    expect(withWalkIn.data).toHaveLength(2);

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role can add a registrant without checking them in", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await addRegistrantAction(event.id, walkInPerson(person.id), 2),
    ).toEqual({ success: true });

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].checked_in_at).toBeNull();
    expect(listed.data[0].party_size).toBe(2);

    await event.cleanup();
    await person.cleanup();
  });

  test("rejects adding a duplicate registrant for the same person/event", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const person1 = walkInPerson(person.id);

    expect(await addRegistrantAction(event.id, person1, 1)).toEqual({
      success: true,
    });
    expect(await addRegistrantAction(event.id, person1, 1)).toEqual({
      error: "This person already has a registration for this event.",
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (events manage) can check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await checkInRegistrantAction(registrationId)).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("rejects a walk-in party size below 1", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 0),
    ).toEqual({ error: "Party size must be at least 1." });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list registrants but not check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);
    expect(await undoCheckInAction(registrationId)).toEqual(DENIED);
    expect(
      await createWalkInCheckInAction(event.id, walkInPerson(person.id), 1),
    ).toEqual(DENIED);
    expect(
      await addRegistrantAction(event.id, walkInPerson(person.id), 1),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role (events view only) can list registrants but not check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const listed = await listEventRegistrantsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither list registrants nor check anyone in", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventRegistrantsAction(event.id)).toEqual(DENIED);
    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });

  test("a deactivated (former) account cannot check in a registrant", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await checkInRegistrantAction(registrationId)).toEqual(DENIED);

    await event.cleanup();
  });
});
