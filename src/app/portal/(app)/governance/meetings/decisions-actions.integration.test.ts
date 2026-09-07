// Integration test: the meeting decision Server Actions against a real local
// Supabase stack (checkUser/checkPermission, then real
// `governance_meeting_decisions` RLS -- the whole table is gated on the
// `governance` resource). The last of the meetings folder's CRUD action files
// to get integration coverage (#456); its siblings (`actions.ts`,
// `agenda-actions.ts`, `action-items-actions.ts`, `attendees-actions.ts`) all
// had it already.
//
// The ordering case is worth the fixture cost here: `listDecisionsAction`
// orders by `decision_date` then `id`, and only real PostgREST parses
// `order=`, so a mocked client would happily pass an unordered list.
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
  fd.set("description", overrides.description ?? "Approved the gear budget.");
  fd.set("decisionDate", overrides.decisionDate ?? "2026-03-01");
  fd.set("topic", overrides.topic ?? "Finance");
  fd.set("voteResult", overrides.voteResult ?? "5-0");
  return fd;
}

describe("meeting decision actions (integration)", () => {
  test("creates, lists in decision-date order, and deletes", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Inserted newest-first so heap order and decision_date order disagree.
    for (const [date, description] of [
      ["2026-03-03", "Third decision"],
      ["2026-03-02", "Second decision"],
      ["2026-03-01", "First decision"],
    ]) {
      expect(
        await createDecisionAction(
          meeting.id,
          decisionForm({ decisionDate: date, description }),
        ),
      ).toEqual({ success: true });
    }
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);

    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.map((d) => d.description)).toEqual([
      "First decision",
      "Second decision",
      "Third decision",
    ]);
    expect(listed.data[0].topic).toBe("Finance");
    expect(listed.data[0].vote_result).toBe("5-0");
    expect(listed.data[0].meeting_id).toBe(meeting.id);

    expect(await deleteDecisionAction(listed.data[0].id)).toEqual({
      success: true,
    });

    const relisted = await listDecisionsAction(meeting.id);
    if (!("data" in relisted)) throw new Error("expected data");
    expect(relisted.data.map((d) => d.description)).toEqual([
      "Second decision",
      "Third decision",
    ]);

    await meeting.cleanup();
  });

  test("stores blank optional fields as null", async () => {
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
    expect(listed.data[0].topic).toBeNull();
    expect(listed.data[0].vote_result).toBeNull();

    await meeting.cleanup();
  });

  test("rejects a decision with no description before touching the database", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createDecisionAction(meeting.id, decisionForm({ description: "" })),
    ).toEqual({ error: "Description is required." });

    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    await meeting.cleanup();
  });

  test("requires a signed-in user to add or remove a decision", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = anonClient();

    expect(await createDecisionAction(meeting.id, decisionForm())).toEqual({
      error: "You must be signed in to add a decision.",
    });
    expect(await deleteDecisionAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove this decision.",
    });
    expect(await listDecisionsAction(meeting.id)).toEqual(DENIED);

    await meeting.cleanup();
  });

  test("finance role (no governance access) can neither list nor add decisions", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(await listDecisionsAction(meeting.id)).toEqual(DENIED);
    expect(await createDecisionAction(meeting.id, decisionForm())).toEqual(
      DENIED,
    );

    await meeting.cleanup();
  });

  test("RLS refuses a delete from a role without governance access, not just the action gate", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(await createDecisionAction(meeting.id, decisionForm())).toEqual({
      success: true,
    });
    const listed = await listDecisionsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    const decisionId = listed.data[0].id;

    // Straight at the table, bypassing the action's checkPermission: a
    // delete that RLS filters to zero rows reports success, so the row
    // itself is what proves the policy held.
    const financeClient = await signInAs(SEEDED_USERS.finance);
    await financeClient
      .from("governance_meeting_decisions")
      .delete()
      .eq("id", decisionId);

    const { data: still } = await adminClient
      .from("governance_meeting_decisions")
      .select("id")
      .eq("id", decisionId);
    expect(still).toHaveLength(1);

    await meeting.cleanup();
  });
});
