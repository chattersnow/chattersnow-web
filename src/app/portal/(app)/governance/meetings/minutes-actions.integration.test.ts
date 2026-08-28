// Integration test: exercises the real minutes Server Actions against a real
// local Supabase stack (checkUser/checkPermission, then real `minutes` RLS).
// Minutes are the meeting's record of what was actually said and decided, and
// they have their own action file that actions.integration.test.ts (which
// only covers the parent `governance_meetings` row) never touches. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createGovernanceMeeting,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getMinutesAction, upsertMinutesAction } =
  await import("./minutes-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function minutesForm(overrides: { bodyText?: string } = {}) {
  const fd = new FormData();
  fd.set("externalLink", "https://example.test/minutes.pdf");
  fd.set("bodyText", overrides.bodyText ?? "Meeting called to order at 6pm.");
  return fd;
}

async function minutesFor(meetingId: string) {
  const { data, error } = await adminClient
    .from("minutes")
    .select("id, meeting_id, external_link, body_text")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedMinutes(meetingId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await upsertMinutesAction(meetingId, minutesForm());
  if ("error" in result) throw new Error(result.error);
}

describe("minutes actions (integration)", () => {
  test("requires a signed-in user to save minutes", async () => {
    currentSupabase = anonClient();

    expect(
      await upsertMinutesAction(crypto.randomUUID(), minutesForm()),
    ).toEqual({ error: "You must be signed in to update the minutes." });
    // getMinutesAction has no checkUser guard -- an anonymous client holds no
    // permissions, so it falls through to the permission check.
    expect(await getMinutesAction(crypto.randomUUID())).toEqual(DENIED);
  });

  test("admin role (governance manage) can save, re-save and read minutes", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await upsertMinutesAction(meeting.id, minutesForm())).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const loaded = await getMinutesAction(meeting.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data).toMatchObject({
      meeting_id: meeting.id,
      external_link: "https://example.test/minutes.pdf",
      body_text: "Meeting called to order at 6pm.",
    });

    // The second call takes the on-conflict update path, a separate RLS
    // policy from the insert one.
    expect(
      await upsertMinutesAction(
        meeting.id,
        minutesForm({ bodyText: "Adjourned at 7:15pm." }),
      ),
    ).toEqual({ success: true });
    expect(await minutesFor(meeting.id)).toMatchObject({
      body_text: "Adjourned at 7:15pm.",
    });

    await meeting.cleanup();
  });

  test("returns null rather than an error for a meeting with no minutes yet", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getMinutesAction(meeting.id)).toEqual({ data: null });

    await meeting.cleanup();
  });

  test("board role (governance manage) can save minutes", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await upsertMinutesAction(meeting.id, minutesForm())).toEqual({
      success: true,
    });

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    await seedMinutes(meeting.id);
    currentSupabase = await signInAs(email);

    expect(await getMinutesAction(meeting.id)).toEqual(DENIED);
    expect(
      await upsertMinutesAction(
        meeting.id,
        minutesForm({ bodyText: "Rewritten by an unauthorized role" }),
      ),
    ).toEqual(DENIED);

    // The denied save must not have landed: the action refuses it, and the
    // `minutes update` policy would too.
    expect(await minutesFor(meeting.id)).toMatchObject({
      body_text: "Meeting called to order at 6pm.",
    });

    await meeting.cleanup();
  }

  test("event_coordinator role can neither read nor save minutes", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role can neither read nor save minutes", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role can neither read nor save minutes", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account can neither read nor save minutes", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
