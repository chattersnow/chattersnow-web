// Integration test: the meeting attendee Server Actions against a real local
// Supabase stack (checkPermission, then real `governance_meeting_attendees`
// RLS -- the whole table is gated on the `governance` resource).
//
// The ordering case is the reason this file exists. The attendee list had no
// ORDER BY, so Postgres returned rows in physical heap order; ticking the
// `attended` checkbox rewrote that row at the end of the heap and it jumped to
// the bottom of the table mid-roll-call. Only real PostgREST parses `order=`,
// so a mocked client can't catch it.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createGovernanceMeeting,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listMeetingAttendeesAction,
  createMeetingAttendeeAction,
  updateMeetingAttendeeAction,
  deleteMeetingAttendeeAction,
} = await import("./attendees-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

describe("meeting attendee actions (integration)", () => {
  test("lists attendees by person name and keeps that order after an edit", async () => {
    const meeting = await createGovernanceMeeting();
    // Inserted in reverse alphabetical order so heap order and name order
    // disagree from the start.
    const zoe = await createPerson({ name: "Zoe Attendee Order" });
    const mia = await createPerson({ name: "Mia Attendee Order" });
    const abe = await createPerson({ name: "Abe Attendee Order" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    for (const person of [zoe, mia, abe]) {
      expect(
        await createMeetingAttendeeAction(meeting.id, person.id, true),
      ).toEqual({ success: true });
    }

    const expected = [
      "Abe Attendee Order",
      "Mia Attendee Order",
      "Zoe Attendee Order",
    ];

    const listed = await listMeetingAttendeesAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.map((a) => a.person.name)).toEqual(expected);

    // Marking the first attendee absent must not move their row.
    expect(await updateMeetingAttendeeAction(listed.data[0].id, false)).toEqual(
      { success: true },
    );

    const relisted = await listMeetingAttendeesAction(meeting.id);
    if (!("data" in relisted)) throw new Error("expected data");
    expect(relisted.data.map((a) => a.person.name)).toEqual(expected);
    expect(relisted.data[0].attended).toBe(false);

    for (const attendee of relisted.data) {
      expect(await deleteMeetingAttendeeAction(attendee.id)).toEqual({
        success: true,
      });
    }
    await meeting.cleanup();
    await Promise.all([zoe.cleanup(), mia.cleanup(), abe.cleanup()]);
  });

  test("requires a signed-in user to add an attendee", async () => {
    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createMeetingAttendeeAction(meeting.id, person.id, true),
    ).toEqual({ error: "You must be signed in to add an attendee." });

    await meeting.cleanup();
    await person.cleanup();
  });

  test("finance role (no governance access) can neither list nor add attendees", async () => {
    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(await listMeetingAttendeesAction(meeting.id)).toEqual(DENIED);
    expect(
      await createMeetingAttendeeAction(meeting.id, person.id, true),
    ).toEqual(DENIED);

    await meeting.cleanup();
    await person.cleanup();
  });
});
