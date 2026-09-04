// Integration test: exercises the real meeting decision Server Actions against
// a real local Supabase stack (checkUser/checkPermission, then real
// `governance_meeting_decisions` RLS). Like the action items beside them, the
// decisions are a child table of a meeting with their own action file, and
// every read here is gated by governance:manage even though the table's own
// select policy allows 'view' -- only a real stack proves both layers agree.
// Requires `bun run db:start && bun run db:reset` first; run via
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

const { listDecisionsAction, createDecisionAction, deleteDecisionAction } =
  await import("./decisions-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function decisionForm(
  overrides: {
    description?: string;
    decisionDate?: string;
    topic?: string;
    voteResult?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("description", overrides.description ?? "Approve the gear budget");
  fd.set("decisionDate", overrides.decisionDate ?? "2026-05-12");
  fd.set("topic", overrides.topic ?? "Budget");
  fd.set("voteResult", overrides.voteResult ?? "5-0 in favor");
  return fd;
}

async function decisionsFor(meetingId: string) {
  const { data, error } = await adminClient
    .from("governance_meeting_decisions")
    .select("id, description, decision_date, topic, vote_result")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  return data;
}

// Seeds one decision via the real action (as admin) so denied-role cases have
// an existing row to attempt a delete against.
async function seedDecision(meetingId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createDecisionAction(meetingId, decisionForm());
  if ("error" in result) throw new Error(result.error);
  const rows = await decisionsFor(meetingId);
  if (rows.length !== 1) throw new Error("expected one seeded decision");
  return rows[0].id as string;
}

describe("meeting decision actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createDecisionAction(crypto.randomUUID(), decisionForm()),
    ).toEqual({ error: "You must be signed in to add a decision." });
    expect(await deleteDecisionAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove this decision.",
    });
    // The list action has no checkUser guard -- an anonymous client holds no
    // permissions, so it falls through to the permission check.
    expect(await listDecisionsAction(crypto.randomUUID())).toEqual(DENIED);
  });

  test("admin role (governance manage) can add, list and remove a decision", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createDecisionAction(meeting.id, decisionForm())).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      meeting_id: meeting.id,
      description: "Approve the gear budget",
      decision_date: "2026-05-12",
      topic: "Budget",
      vote_result: "5-0 in favor",
    });

    expect(await deleteDecisionAction(listed.data[0].id)).toEqual({
      success: true,
    });
    expect(await decisionsFor(meeting.id)).toHaveLength(0);

    await meeting.cleanup();
  });

  test("board role (governance manage) lists decisions oldest first", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Inserted newest first so heap order and decision_date order disagree.
    for (const decisionDate of ["2026-07-01", "2026-05-01", "2026-06-01"]) {
      expect(
        await createDecisionAction(
          meeting.id,
          decisionForm({
            description: `Decided ${decisionDate}`,
            decisionDate,
          }),
        ),
      ).toEqual({ success: true });
    }

    currentSupabase = await signInAs(SEEDED_USERS.board);
    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.map((d) => d.decision_date)).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);

    await meeting.cleanup();
  });

  test("stores an optional topic and vote result as null when left blank", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createDecisionAction(
        meeting.id,
        decisionForm({ topic: "", voteResult: "" }),
      ),
    ).toEqual({ success: true });

    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data[0]).toMatchObject({ topic: null, vote_result: null });

    await meeting.cleanup();
  });

  test("rejects a decision with no description or no date, even for a permitted role", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createDecisionAction(
        meeting.id,
        decisionForm({ description: "  " }),
      ),
    ).toEqual({ error: "Description is required." });
    expect(
      await createDecisionAction(
        meeting.id,
        decisionForm({ decisionDate: "" }),
      ),
    ).toEqual({ error: "Decision date is required." });
    expect(await decisionsFor(meeting.id)).toHaveLength(0);

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    const decisionId = await seedDecision(meeting.id);
    currentSupabase = await signInAs(email);

    expect(await listDecisionsAction(meeting.id)).toEqual(DENIED);
    expect(await createDecisionAction(meeting.id, decisionForm())).toEqual(
      DENIED,
    );
    expect(await deleteDecisionAction(decisionId)).toEqual(DENIED);

    // Neither denied write landed: the actions refuse them, and the table's
    // RLS policies would too.
    const remaining = await decisionsFor(meeting.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      description: "Approve the gear budget",
    });

    await meeting.cleanup();
  }

  test("event_coordinator role has no access to decisions", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role has no access to decisions", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role has no access to decisions", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account has no access to decisions", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
