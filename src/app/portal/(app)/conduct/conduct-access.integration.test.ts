import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
  unprivilegedActors,
} from "../../../../../test/integration-setup";
import { SEEDED_CONDUCT_IDS } from "../../../../../test/seed-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who can read a conduct report, checked in the database rather than in a
 * component (#687).
 *
 * This is the half of the feature that a unit test cannot reach and the half
 * that matters most: a report may name a board member, so "governance
 * administrators cannot read one" has to be true of the table, not only of the
 * page. Every case below is a query made directly by a real session, with no
 * application code in the way.
 *
 * The seed gives `board` the `conduct_reports:view` grant that makes a board
 * member assignable, which is what lets the reviewer cases here be about
 * assignment rather than about the permission.
 */

const { shoutedAt, groupChat, gearTable } = SEEDED_CONDUCT_IDS;

let boardOwn: SupabaseClient;
let reviewerRowId: string | null = null;
/** What supabase/seed.sql wrote, which afterAll puts back. */
let SEEDED_RECUSAL = {
  on: null as string | null,
  reason: null as string | null,
};

async function boardIsAssigned(): Promise<string> {
  const { data, error } = await adminClient
    .from("conduct_report_reviewers")
    .select("id, user_id")
    .eq("report_id", shoutedAt);
  if (error) throw error;
  const { data: users } = await adminClient.rpc(
    "list_conduct_reviewer_candidates",
  );
  const board = (users ?? []).find(
    (candidate: { email: string | null }) =>
      candidate.email === SEEDED_USERS.board,
  );
  expect(board, "board@example.test should be assignable").toBeDefined();
  const row = (data ?? []).find(
    (reviewer: { user_id: string }) => reviewer.user_id === board.user_id,
  );
  return row?.id as string;
}

beforeAll(async () => {
  boardOwn = await signInAs(SEEDED_USERS.board);
  reviewerRowId = await boardIsAssigned();
  const { data } = await adminClient
    .from("conduct_report_reviewers")
    .select("recused_on, recusal_reason")
    .eq("id", reviewerRowId)
    .single();
  SEEDED_RECUSAL = {
    on: (data?.recused_on as string | null) ?? null,
    reason: (data?.recusal_reason as string | null) ?? null,
  };
});

// Restored rather than deleted: this row is seed data, not a fixture, and the
// seeded case is what the a11y scan and the demo tenant render. A delete here
// left the local database missing the one recused reviewer in it.
afterAll(async () => {
  if (reviewerRowId) {
    await adminClient
      .from("conduct_report_reviewers")
      .update({
        recused_on: SEEDED_RECUSAL.on,
        recusal_reason: SEEDED_RECUSAL.reason,
      })
      .eq("id", reviewerRowId);
  }
});

describe("who can read a conduct report", () => {
  test("the intake holder sees every report", async () => {
    const { data, error } = await adminClient
      .from("conduct_reports")
      .select("id, summary");
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id).sort()).toEqual(
      [shoutedAt, groupChat, gearTable].sort(),
    );
  });

  // The case #687 puts first. `board` holds governance:manage, and a conduct
  // report may name a board member.
  test("a board member with no assignment sees nothing at all", async () => {
    const { data, error } = await boardOwn.from("conduct_reports").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test("and nothing in the three tables that hang off one", async () => {
    for (const table of [
      "conduct_report_reviewers",
      "conduct_report_actions",
      "conduct_report_appeals",
    ]) {
      const { data, error } = await boardOwn.from(table).select("id");
      expect(error, `${table} should not error`).toBeNull();
      expect(data ?? [], `${table} should be empty`).toEqual([]);
    }
  });

  test("nobody unprivileged reaches a report, signed out included", async () => {
    for (const actor of await unprivilegedActors()) {
      const { data } = await actor.client.from("conduct_reports").select("id");
      expect(data ?? [], `${actor.name} should see nothing`).toEqual([]);
    }
    const { data } = await anonClient().from("conduct_reports").select("id");
    expect(data ?? []).toEqual([]);
  });

  test("an assigned reviewer sees that case and only that case", async () => {
    // The seeded board assignment is recused, so start by clearing it: the
    // assertion is about assignment, and the recusal has its own test below.
    await adminClient
      .from("conduct_report_reviewers")
      .update({ recused_on: null, recusal_reason: null })
      .eq("id", reviewerRowId);

    const { data } = await boardOwn.from("conduct_reports").select("id");
    expect((data ?? []).map((row) => row.id)).toEqual([shoutedAt]);

    const { data: actions } = await boardOwn
      .from("conduct_report_actions")
      .select("report_id");
    expect((actions ?? []).map((row) => row.report_id)).toEqual([shoutedAt]);
  });

  // Recusal takes the case away, not just the vote. A reviewer who stepped
  // back because the report names their friend should not keep reading it.
  test("recusing removes the case from the reviewer's view", async () => {
    const { error } = await boardOwn.rpc("recuse_from_conduct_report", {
      p_report_id: shoutedAt,
      p_reason: "The coach named in the report coaches my daughter's group.",
    });
    expect(error).toBeNull();

    const { data } = await boardOwn.from("conduct_reports").select("id");
    expect(data ?? []).toEqual([]);

    const { data: row } = await adminClient
      .from("conduct_report_reviewers")
      .select("recused_on, recusal_reason")
      .eq("id", reviewerRowId!)
      .single();
    expect(row?.recused_on).not.toBeNull();
    expect(row?.recusal_reason).toContain("daughter");
  });

  test("recusing twice, or on a case you are not on, is refused", async () => {
    const again = await boardOwn.rpc("recuse_from_conduct_report", {
      p_report_id: shoutedAt,
      p_reason: "Still conflicted",
    });
    expect(String(again.error?.message)).toContain("NOT_ASSIGNED");

    const elsewhere = await boardOwn.rpc("recuse_from_conduct_report", {
      p_report_id: groupChat,
      p_reason: "Not mine",
    });
    expect(String(elsewhere.error?.message)).toContain("NOT_ASSIGNED");
  });
});

describe("what a reviewer may write", () => {
  test("a reviewer cannot edit the report, the actions or the appeal", async () => {
    // Re-assign so the reviewer can see the case at all; a write refused
    // because the row is invisible would prove nothing about the write.
    await adminClient
      .from("conduct_report_reviewers")
      .update({ recused_on: null, recusal_reason: null })
      .eq("id", reviewerRowId!);

    const summary = await boardOwn
      .from("conduct_reports")
      .update({ summary: "rewritten" })
      .eq("id", shoutedAt)
      .select("id");
    expect(summary.data ?? []).toEqual([]);

    const action = await boardOwn
      .from("conduct_report_actions")
      .insert({
        report_id: shoutedAt,
        kind: "final",
        description: "x",
        taken_on: "2026-09-01",
      })
      .select("id");
    expect(action.error).not.toBeNull();

    const appeal = await boardOwn
      .from("conduct_report_appeals")
      .insert({ report_id: shoutedAt, filed_on: "2026-09-01" })
      .select("id");
    expect(appeal.error).not.toBeNull();
  });

  test("nobody can delete a report", async () => {
    const { data } = await adminClient
      .from("conduct_reports")
      .delete()
      .eq("id", groupChat)
      .select("id");
    expect(data ?? []).toEqual([]);

    const { data: still } = await adminClient
      .from("conduct_reports")
      .select("id")
      .eq("id", groupChat);
    expect((still ?? []).length).toBe(1);
  });
});

describe("assignment cannot be a promise it does not keep", () => {
  // The failure this closes: intake assigns somebody, the toast says it
  // worked, and they open the portal to find nothing there.
  test("assigning somebody who cannot see conduct reports is refused", async () => {
    const { data: coordinator } = await adminClient
      .from("user_roles")
      .select("user_id")
      .limit(1000);

    const { data: users } = await adminClient.rpc(
      "list_conduct_reviewer_candidates",
    );
    const assignable = new Set(
      (users ?? []).map((row: { user_id: string }) => row.user_id),
    );
    const outsider = (coordinator ?? [])
      .map((row) => row.user_id as string)
      .find((id) => !assignable.has(id));
    expect(
      outsider,
      "the seed should hold somebody without the grant",
    ).toBeDefined();

    const { error } = await adminClient
      .from("conduct_report_reviewers")
      .insert({ report_id: groupChat, stage: "review", user_id: outsider });
    expect(String(error?.message)).toContain(
      "REVIEWER_CANNOT_SEE_CONDUCT_REPORTS",
    );
  });

  test("the candidate list is empty for somebody without intake", async () => {
    const { data } = await boardOwn.rpc("list_conduct_reviewer_candidates");
    expect(data ?? []).toEqual([]);
  });
});

describe("the audit trail carries the change and not the narrative", () => {
  // #687 asks for this to be confirmed rather than assumed: audit_log is read
  // by `administration:manage`, which is a different permission from the one
  // guarding these rows.
  test("no conduct narrative reaches the audit log", async () => {
    const { data, error } = await adminClient
      .from("audit_log")
      .select("table_name, new_data, old_data")
      .in("table_name", [
        "conduct_reports",
        "conduct_report_reviewers",
        "conduct_report_actions",
        "conduct_report_appeals",
      ]);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    for (const entry of data ?? []) {
      for (const snapshot of [entry.new_data, entry.old_data]) {
        if (!snapshot) continue;
        const row = snapshot as Record<string, unknown>;
        for (const column of [
          "summary",
          "outcome",
          "context",
          "subject_description",
          "reporter_name",
          "reporter_contact",
          "recusal_reason",
          "description",
          "grounds",
        ]) {
          expect(
            row[column] ?? null,
            `${entry.table_name}.${column} reached the audit log`,
          ).toBeNull();
        }
      }
    }
  });

  // The shape of the change is exactly what does survive, so the trail can
  // answer "who changed this case, and when".
  test("the reference, the status and the dates do survive", async () => {
    const { data } = await adminClient
      .from("audit_log")
      .select("new_data")
      .eq("table_name", "conduct_reports")
      .eq("action", "insert")
      .limit(1);
    const row = (data?.[0]?.new_data ?? {}) as Record<string, unknown>;
    expect(String(row.reference)).toMatch(/^CR-/);
    expect(row.status).toBeDefined();
    expect(row.received_on).toBeDefined();
  });
});
