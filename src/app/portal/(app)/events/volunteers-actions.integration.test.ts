// Integration test: exercises the real event volunteer and volunteer-hours
// Server Actions against a real local Supabase stack (checkPermission /
// checkAnyPermission, then real `event_volunteers` and
// `event_volunteer_hours` RLS).
//
// Two different gates are covered here. `event_volunteers` rides on the
// shared `events` resource (select events:view, writes events:manage). The
// hours table has its own `event_volunteer_hours` resource plus the "log own
// hours" carve-out (20260822100000): insert passes on
// event_volunteer_hours:manage OR volunteer_hours_logging:manage, while
// update/delete need event_volunteer_hours:manage only -- so a plain
// volunteer can log hours but can never delete an entry.
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
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventVolunteersAction,
  createEventVolunteerAction,
  updateEventVolunteerShiftAction,
  deleteEventVolunteerAction,
  listEventVolunteerHoursAction,
  createEventVolunteerHoursAction,
  deleteEventVolunteerHoursAction,
} = await import("./volunteers-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function volunteerForm() {
  const fd = new FormData();
  fd.set("role", "Beginner buddy");
  fd.set("notes", "Available all day");
  return fd;
}

function hoursForm(overrides: { hours?: string } = {}) {
  const fd = new FormData();
  fd.set("hours", overrides.hours ?? "4.5");
  fd.set("loggedDate", new Date().toISOString().slice(0, 10));
  fd.set("notes", "Ran the gear table");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

// A person already signed up as a volunteer for the event, which
// createEventVolunteerHoursAction requires before it will log any hours.
async function seedSignup(eventId: string, personId: string) {
  const { error } = await adminClient
    .from("event_volunteers")
    .insert({ event_id: eventId, person_id: personId, role: "Beginner buddy" });
  if (error) throw error;
}

describe("event volunteer actions (integration)", () => {
  test("requires a signed-in user to add a volunteer", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual({ error: "You must be signed in to add a volunteer." });

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role (events manage) can add, list, reassign, and remove a volunteer", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual({ success: true });

    const listed = await listEventVolunteersAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].person.id).toBe(person.id);

    expect(
      await updateEventVolunteerShiftAction(listed.data[0].id, null),
    ).toEqual({ success: true });
    expect(await deleteEventVolunteerAction(listed.data[0].id)).toEqual({
      success: true,
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (events manage) can add a volunteer", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual({ success: true });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list but not write volunteers", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventVolunteersAction(event.id))).toBe(true);
    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual(DENIED);
    expect(
      await updateEventVolunteerShiftAction(crypto.randomUUID(), null),
    ).toEqual(DENIED);
    expect(await deleteEventVolunteerAction(crypto.randomUUID())).toEqual(
      DENIED,
    );

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role (events view only) can list but not sign anyone up", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listEventVolunteersAction(event.id))).toBe(true);
    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("board role (no events access) can neither list nor add volunteers", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventVolunteersAction(event.id)).toEqual(DENIED);
    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("a deactivated (former) account cannot add a volunteer", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(
      await createEventVolunteerAction(event.id, person.id, volunteerForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });
});

describe("event volunteer hours actions (integration)", () => {
  test("requires a signed-in user to log hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual({ error: "You must be signed in to log hours." });

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role (event_volunteer_hours manage) can log, list, and delete hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual({ success: true });

    const listed = await listEventVolunteerHoursAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(Number(listed.data[0].hours)).toBe(4.5);

    expect(await deleteEventVolunteerHoursAction(listed.data[0].id)).toEqual({
      success: true,
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("hours can only be logged against an existing volunteer sign-up", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual({
      error:
        "This person must be signed up as a volunteer for this event before hours can be logged.",
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (event_volunteer_hours manage) can log hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual({ success: true });

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role can log hours via the volunteer_hours_logging carve-out but cannot delete an entry", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    // volunteer is event_volunteer_hours:view -- the insert only goes through
    // because of volunteer_hours_logging:manage.
    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual({ success: true });

    const listed = await listEventVolunteerHoursAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    expect(await deleteEventVolunteerHoursAction(listed.data[0].id)).toEqual(
      DENIED,
    );

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (hours view, no logging carve-out) can list but not log hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventVolunteerHoursAction(event.id))).toBe(
      true,
    );
    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual(DENIED);
    expect(await deleteEventVolunteerHoursAction(crypto.randomUUID())).toEqual(
      DENIED,
    );

    await event.cleanup();
    await person.cleanup();
  });

  test("board role (no hours access) can neither list nor log hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventVolunteerHoursAction(event.id)).toEqual(DENIED);
    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("a deactivated (former) account cannot log hours", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(
      await createEventVolunteerHoursAction(event.id, person.id, hoursForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });
});
