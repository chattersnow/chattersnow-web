// Integration test: exercises the real event volunteer and volunteer-hours
// Server Actions against a real local Supabase stack (checkPermission /
// checkAnyPermission, then real `event_volunteers` and `volunteer_hours` RLS).
//
// Two different gates are covered here. `event_volunteers` rides on the
// shared `events` resource (select events:view, writes events:manage). The
// hours actions write the shared `volunteer_hours` ledger -- 20260904010000
// folded `event_volunteer_hours` into it -- and are gated by the
// `event_volunteer_hours` resource, which survived its table as the
// event-scoped permission concept: its checks are OR'd into `volunteer_hours`'
// policies wherever `event_id is not null`. Plus the "log own hours" carve-out
// (20260822100000): insert passes on event_volunteer_hours:manage OR
// volunteer_hours_logging:manage, while update/delete need
// event_volunteer_hours:manage only -- so a plain volunteer can log hours but
// can never delete an entry.
//
// The whole `event volunteer hours actions` block below is the no-regression
// proof for that consolidation: every case in it predates the merge and must
// still pass unchanged. The two `shared volunteer_hours ledger` cases at the
// end are the new surface area -- that the resource still grants event-linked
// rows, and that it grants nothing on org-wide ones.
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

// Rows seeded during a test outlive it: `createPublishedEvent().cleanup()`
// does a bare `delete from events` whose error is never checked, and the
// prevent_delete_with_records guard (20260903060000) refuses that delete while
// a signup or an hours entry still points at the event. Drop them first so the
// event actually goes away. (Pre-existing for signups; consolidation just puts
// hours on the same footing, since volunteer_hours is a blocker too.)
async function clearVolunteerRecords(eventId: string) {
  for (const table of ["volunteer_hours", "event_volunteers"]) {
    const { error } = await adminClient
      .from(table)
      .delete()
      .eq("event_id", eventId);
    if (error) throw error;
  }
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

  // Regression: the signup list had no ORDER BY, so Postgres returned rows in
  // physical heap order. An UPDATE writes a new row version at the end of the
  // heap, which made the row you just edited jump to the bottom of the table.
  // Ordering by the embedded person name (with an id tiebreaker) can only be
  // exercised against real PostgREST -- a mocked client never parses `order=`.
  test("lists volunteers by person name and keeps that order after an edit", async () => {
    const event = await createPublishedEvent();
    // Inserted in reverse alphabetical order so heap order and name order
    // disagree from the start.
    const zoe = await createPerson({ name: "Zoe Ordering Test" });
    const mia = await createPerson({ name: "Mia Ordering Test" });
    const abe = await createPerson({ name: "Abe Ordering Test" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    for (const person of [zoe, mia, abe]) {
      expect(
        await createEventVolunteerAction(event.id, person.id, volunteerForm()),
      ).toEqual({ success: true });
    }

    const listed = await listEventVolunteersAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.map((v) => v.person.name)).toEqual([
      "Abe Ordering Test",
      "Mia Ordering Test",
      "Zoe Ordering Test",
    ]);

    // Editing the first row must not move it. Writing the same shift_id still
    // produces a new tuple version, which is what used to reorder the table.
    const first = listed.data[0];
    expect(await updateEventVolunteerShiftAction(first.id, null)).toEqual({
      success: true,
    });

    const relisted = await listEventVolunteersAction(event.id);
    if (!("data" in relisted)) throw new Error("expected data");
    expect(relisted.data.map((v) => v.person.name)).toEqual([
      "Abe Ordering Test",
      "Mia Ordering Test",
      "Zoe Ordering Test",
    ]);

    for (const volunteer of relisted.data) {
      expect(await deleteEventVolunteerAction(volunteer.id)).toEqual({
        success: true,
      });
    }
    await event.cleanup();
    await Promise.all([zoe.cleanup(), mia.cleanup(), abe.cleanup()]);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
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

    await clearVolunteerRecords(event.id);
    await event.cleanup();
    await person.cleanup();
  });

  // The new surface area from 20260904010000. event_coordinator holds
  // event_volunteer_hours:manage but only volunteers:view, so if the
  // consolidated policies had dropped the event_volunteer_hours branch this
  // would fail -- and if they had dropped its `event_id is not null` scoping,
  // the second test would fail instead.
  test("shared volunteer_hours ledger: event_coordinator can manage an event-linked row it did not create", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await seedSignup(event.id, person.id);

    const { data: seeded, error } = await adminClient
      .from("volunteer_hours")
      .insert({
        event_id: event.id,
        person_id: person.id,
        hours: 2.25,
        logged_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw error;

    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const listed = await listEventVolunteerHoursAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.map((entry) => entry.id)).toContain(seeded.id);

    expect(await deleteEventVolunteerHoursAction(seeded.id)).toEqual({
      success: true,
    });

    await clearVolunteerRecords(event.id);
    await event.cleanup();
    await person.cleanup();
  });

  test("shared volunteer_hours ledger: the event_volunteer_hours resource grants nothing on org-wide rows", async () => {
    const person = await createPerson();

    // event_id null -- an org-wide entry from Volunteers > Participation,
    // outside the event-scoped branch of every policy.
    const { data: seeded, error } = await adminClient
      .from("volunteer_hours")
      .insert({
        person_id: person.id,
        event_id: null,
        hours: 1.5,
        logged_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw error;

    // finance is event_volunteer_hours:view / volunteers:none -- it can read
    // event-linked hours (asserted above) but must not reach this row.
    const financeClient = await signInAs(SEEDED_USERS.finance);
    const financeRead = await financeClient
      .from("volunteer_hours")
      .select("id")
      .eq("id", seeded.id);
    expect(financeRead.data ?? []).toHaveLength(0);

    // coordinator is event_volunteer_hours:manage / volunteers:view -- the
    // delete is silently a no-op rather than an error under RLS.
    const coordinatorClient = await signInAs(SEEDED_USERS.coordinator);
    await coordinatorClient
      .from("volunteer_hours")
      .delete()
      .eq("id", seeded.id);

    const { data: survivors } = await adminClient
      .from("volunteer_hours")
      .select("id")
      .eq("id", seeded.id);
    expect(survivors ?? []).toHaveLength(1);

    await adminClient.from("volunteer_hours").delete().eq("id", seeded.id);
    await person.cleanup();
  });
});
