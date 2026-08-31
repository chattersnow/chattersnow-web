// Integration test: exercises the real minutes-approval Server Actions
// (getPreviousMeetingMinutesAction, approveMinutesAction) against a real
// local Supabase stack. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run
// test`.
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

const { getPreviousMeetingMinutesAction, approveMinutesAction } =
  await import("./minutes-approval-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

async function seedAgenda(meetingId: string, bodyText: string) {
  const { error } = await adminClient
    .from("agendas")
    .insert({ meeting_id: meetingId, body_text: bodyText });
  if (error) throw error;
}

async function seedDecision(meetingId: string, description: string) {
  const { error } = await adminClient
    .from("governance_meeting_decisions")
    .insert({
      meeting_id: meetingId,
      description,
      decision_date: new Date().toISOString().slice(0, 10),
    });
  if (error) throw error;
}

async function seedActionItem(
  meetingId: string,
  ownerPersonId: string,
  description: string,
) {
  const { error } = await adminClient
    .from("governance_meeting_action_items")
    .insert({
      meeting_id: meetingId,
      owner_person_id: ownerPersonId,
      description,
    });
  if (error) throw error;
}

async function meetingApprovalFields(meetingId: string) {
  const { data, error } = await adminClient
    .from("governance_meetings")
    .select("minutes_approved_at, minutes_approved_by")
    .eq("id", meetingId)
    .single();
  if (error) throw error;
  return data;
}

describe("minutes approval actions (integration)", () => {
  test("getPreviousMeetingMinutesAction requires governance:manage; approveMinutesAction requires sign-in", async () => {
    currentSupabase = anonClient();

    expect(
      await getPreviousMeetingMinutesAction(
        crypto.randomUUID(),
        new Date().toISOString(),
      ),
    ).toEqual(DENIED);
    expect(await approveMinutesAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to approve minutes.",
    });
  });

  test("board role sees the single most recent prior meeting's notes, decisions, and action items", async () => {
    // All three dated in the future (unlike supabase/seed.sql's bulk
    // governance meetings, which are randomly dated up to 700 days in the
    // past), so this trio's relative ordering can't collide with seed noise.
    const earliest = await createGovernanceMeeting({
      meetingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const mostRecentPrior = await createGovernanceMeeting({
      meetingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const currentMeetingDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const current = await createGovernanceMeeting({
      meetingDate: currentMeetingDate,
    });
    const owner = await createPerson();

    await seedAgenda(earliest.id, "Notes from the older meeting.");
    await seedAgenda(
      mostRecentPrior.id,
      "Notes from the most recent prior meeting.",
    );
    await seedDecision(mostRecentPrior.id, "Approved the winter budget.");
    await seedActionItem(
      mostRecentPrior.id,
      owner.id,
      "Follow up with the vendor.",
    );

    currentSupabase = await signInAs(SEEDED_USERS.board);
    const result = await getPreviousMeetingMinutesAction(
      current.id,
      currentMeetingDate,
    );
    if (!("data" in result) || !result.data) {
      throw new Error("expected previous meeting data");
    }
    expect(result.data.meetingId).toBe(mostRecentPrior.id);
    expect(result.data.bodyText).toBe(
      "Notes from the most recent prior meeting.",
    );
    expect(result.data.decisions).toHaveLength(1);
    expect(result.data.decisions[0].description).toBe(
      "Approved the winter budget.",
    );
    expect(result.data.actionItems).toHaveLength(1);
    expect(result.data.actionItems[0].description).toBe(
      "Follow up with the vendor.",
    );

    await earliest.cleanup();
    await mostRecentPrior.cleanup();
    await current.cleanup();
    await owner.cleanup();
  });

  test("returns null when there is no prior meeting", async () => {
    // Older than any meeting supabase/seed.sql can generate (its bulk
    // governance meetings are randomly dated up to 700 days back), so this
    // is reliably the earliest meeting on record.
    const meetingDate = new Date(
      Date.now() - 800 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const only = await createGovernanceMeeting({ meetingDate });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getPreviousMeetingMinutesAction(only.id, meetingDate);
    if (!("data" in result)) throw new Error("expected data");
    expect(result.data).toBeNull();

    await only.cleanup();
  });

  test("admin role can mark minutes approved, recording who and when", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const before = await meetingApprovalFields(meeting.id);
    expect(before.minutes_approved_at).toBeNull();

    expect(await approveMinutesAction(meeting.id)).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const after = await meetingApprovalFields(meeting.id);
    expect(after.minutes_approved_at).not.toBeNull();
    expect(after.minutes_approved_by).not.toBeNull();

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(email);

    expect(
      await getPreviousMeetingMinutesAction(
        meeting.id,
        new Date().toISOString(),
      ),
    ).toEqual(DENIED);
    expect(await approveMinutesAction(meeting.id)).toEqual(DENIED);

    const fields = await meetingApprovalFields(meeting.id);
    expect(fields.minutes_approved_at).toBeNull();

    await meeting.cleanup();
  }

  test("event_coordinator role has no access to minutes approval", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role has no access to minutes approval", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role has no access to minutes approval", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account has no access to minutes approval", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
