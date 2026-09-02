// Integration test: exercises the real createMeetingAction against a real
// local Supabase stack (checkPermission, then real `governance_meetings`
// RLS). governance:manage is the board's core resource (admin and board
// only -- event_coordinator/finance/volunteer are all 'none'), and no
// integration test previously touched `governance_meetings` itself --
// resolutions-actions.integration.test.ts only exercises the `resolutions`
// leaf table. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createMeetingAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function meetingForm() {
  const fd = new FormData();
  fd.set("meetingDate", new Date(Date.now() + 7 * 86_400_000).toISOString());
  fd.set("meetingType", "board");
  fd.set("status", "scheduled");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function cleanupMeeting(id: string) {
  await adminClient.from("governance_meetings").delete().eq("id", id);
}

describe("createMeetingAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual({
      error: "You must be signed in to schedule a meeting.",
    });
  });

  test("admin role (governance manage) can schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(
      expect.objectContaining({ success: true, id: expect.any(String) }),
    );
    if ("id" in result && result.id) await cleanupMeeting(result.id);
  });

  test("board role (governance manage) can schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(
      expect.objectContaining({ success: true, id: expect.any(String) }),
    );
    if ("id" in result && result.id) await cleanupMeeting(result.id);
  });

  test("event_coordinator role (no governance access) cannot schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(DENIED);
  });

  test("finance role (no governance access) cannot schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no governance access) cannot schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot schedule a meeting", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createMeetingAction(meetingForm());
    expect(result).toEqual(DENIED);
  });
});
