// Integration test: the meeting attendee Server Actions against a real local
// Supabase stack (checkUser/checkPermission, then real
// `governance_meeting_attendees` RLS -- the whole table is gated on the
// `governance` resource).
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
  adminClient,
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

async function attendeesFor(meetingId: string) {
  const { data, error } = await adminClient
    .from("governance_meeting_attendees")
    .select("id, person_id, attended")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  return data;
}

// Seeds one attendee via the real action (as admin) so denied-role cases have
// an existing row to attempt an update/delete against.
async function seedAttendee(meetingId: string, personId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createMeetingAttendeeAction(meetingId, personId, true);
  if ("error" in result) throw new Error(result.error);
  const rows = await attendeesFor(meetingId);
  if (rows.length !== 1) throw new Error("expected one seeded attendee");
  return rows[0].id as string;
}

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

  test("requires a signed-in user", async () => {
    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createMeetingAttendeeAction(meeting.id, person.id, true),
    ).toEqual({ error: "You must be signed in to add an attendee." });
    expect(
      await updateMeetingAttendeeAction(crypto.randomUUID(), false),
    ).toEqual({ error: "You must be signed in to update an attendee." });
    expect(await deleteMeetingAttendeeAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove an attendee.",
    });
    // The list action has no checkUser guard -- an anonymous client holds no
    // permissions, so it falls through to the permission check.
    expect(await listMeetingAttendeesAction(meeting.id)).toEqual(DENIED);

    await meeting.cleanup();
    await person.cleanup();
  });

  test("reports the same person added twice, rather than a generic failure", async () => {
    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    await seedAttendee(meeting.id, person.id);

    // The `governance_meeting_attendees_unique_person` constraint, surfaced
    // as 23505: only a real Postgres raises it.
    expect(
      await createMeetingAttendeeAction(meeting.id, person.id, false),
    ).toEqual({ error: "This person is already listed for this meeting." });
    expect(await attendeesFor(meeting.id)).toHaveLength(1);

    await meeting.cleanup();
    await person.cleanup();
  });

  test("requires a person, even for a permitted role", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createMeetingAttendeeAction(meeting.id, "", true)).toEqual({
      error: "Select or create a person to add.",
    });
    expect(await attendeesFor(meeting.id)).toHaveLength(0);

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    const other = await createPerson();
    const attendeeId = await seedAttendee(meeting.id, person.id);
    currentSupabase = await signInAs(email);

    expect(await listMeetingAttendeesAction(meeting.id)).toEqual(DENIED);
    expect(
      await createMeetingAttendeeAction(meeting.id, other.id, true),
    ).toEqual(DENIED);
    expect(await updateMeetingAttendeeAction(attendeeId, false)).toEqual(
      DENIED,
    );
    expect(await deleteMeetingAttendeeAction(attendeeId)).toEqual(DENIED);

    // None of the denied writes landed: the actions refuse them, and the
    // table's RLS policies would too.
    const remaining = await attendeesFor(meeting.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      person_id: person.id,
      attended: true,
    });

    await meeting.cleanup();
    await Promise.all([person.cleanup(), other.cleanup()]);
  }

  test("event_coordinator role has no access to attendees", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role has no access to attendees", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role has no access to attendees", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account has no access to attendees", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
