// #1082 Phase 1 style. See home/donation-core.test.ts for what these can prove:
// which statement the core sends and how it reads the answer, never whether a
// policy or a trigger agrees. The RLS and RPC behaviour is in
// minutes-actions.integration.test.ts.
import { describe, expect, test } from "bun:test";
import {
  finalizeMinutes,
  getMinutes,
  reopenMinutes,
  saveMinutesDraft,
  startMinutesFromAgenda,
} from "./minutes-core";
import type { ActionFailure } from "@/lib/portal/action-result";
import { fakeSupabase } from "../../../../../../test/fake-supabase";

const MANAGE = { governance: "manage" as const };
const VIEW = { governance: "view" as const };
const FORBIDDEN: ActionFailure = {
  error: {
    code: "forbidden",
    message: "You don't have permission to perform this action.",
  },
};

const MEETING = { id: "meeting-1", meeting_date: "2026-03-18T18:00:00.000Z" };

const AGENDA_ROW = {
  external_link: null,
  body_text: "Carried over from the agenda.",
  template_id: "template-1",
  template_version_id: "version-1",
  ongoing_items: { finance_fundraising: { updates: "On track" } },
  new_business: [],
  parking_lot: [],
  upcoming_dates: [],
  next_meeting_date: null,
  next_meeting_topics: null,
  agenda_template_versions: {
    sections: [
      {
        key: "finance_fundraising",
        label: "Finance & Fundraising",
        topics: [],
      },
    ],
  },
};

const MINUTES_ROW = {
  id: "minutes-1",
  meeting_id: "meeting-1",
  agenda_snapshot: {
    version: 1,
    meeting_date: MEETING.meeting_date,
    template_id: "template-1",
    template_version_id: "version-1",
    external_link: null,
    items: [{ key: "opening", label: "Opening", kind: "opening" }],
  },
  notes: { opening: "Quorum met." },
  body_text: "Closed at 19:40.",
  status: "draft",
  finalized_at: null,
  finalized_by: null,
  approved_at: null,
  approved_by: null,
  approved_at_meeting_id: null,
  updated_at: "2026-03-18T19:41:00.000Z",
};

describe("getMinutes", () => {
  test("is gated at governance:view, matching its select policy", async () => {
    const supabase = fakeSupabase({
      permissions: VIEW,
      select: { meeting_minutes: { rows: [MINUTES_ROW] } },
    });

    const result = await getMinutes(supabase.client, "meeting-1");

    expect(result).toMatchObject({ data: { id: "minutes-1" } });
  });

  test("refuses a caller with no governance access at all", async () => {
    const supabase = fakeSupabase({ permissions: {} });

    expect(await getMinutes(supabase.client, "meeting-1")).toEqual(FORBIDDEN);
    expect(supabase.statements).toEqual([]);
  });

  test("answers null for a meeting whose minutes were never started", async () => {
    const supabase = fakeSupabase({ permissions: VIEW });

    expect(await getMinutes(supabase.client, "meeting-1")).toEqual({
      data: null,
    });
  });

  test("a snapshot that is not a snapshot reads as none, not as a crash", async () => {
    const supabase = fakeSupabase({
      permissions: VIEW,
      select: {
        meeting_minutes: {
          rows: [{ ...MINUTES_ROW, agenda_snapshot: "who knows", notes: [] }],
        },
      },
    });

    const result = await getMinutes(supabase.client, "meeting-1");
    expect(result).toMatchObject({
      data: { agenda_snapshot: null, notes: {} },
    });
  });
});

describe("startMinutesFromAgenda", () => {
  function starting(overrides: Parameters<typeof fakeSupabase>[0] = {}) {
    return fakeSupabase({
      permissions: MANAGE,
      select: {
        governance_meetings: { rows: [MEETING] },
        agendas: { rows: [AGENDA_ROW] },
      },
      insert: { meeting_minutes: { rows: [MINUTES_ROW] } },
      ...overrides,
    });
  }

  test("refuses a signed-out caller before reading anything", async () => {
    const supabase = fakeSupabase({ userId: null });

    expect(await startMinutesFromAgenda(supabase.client, "meeting-1")).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to start minutes.",
      },
    });
    expect(supabase.statements).toEqual([]);
  });

  test("refuses a caller with governance:view only", async () => {
    const supabase = starting({ permissions: VIEW });

    expect(await startMinutesFromAgenda(supabase.client, "meeting-1")).toEqual(
      FORBIDDEN,
    );
    expect(supabase.statements).toEqual([]);
  });

  test("freezes the agenda and seeds the closing notes from it", async () => {
    const supabase = starting();

    const result = await startMinutesFromAgenda(supabase.client, "meeting-1");

    expect(result).toMatchObject({ success: true, data: { id: "minutes-1" } });
    const insert = supabase.statements.find(
      (statement) => statement.operation === "insert",
    );
    const values = insert?.values as {
      meeting_id: string;
      body_text: string | null;
      agenda_snapshot: { items: { key: string }[] };
    };
    expect(insert?.table).toBe("meeting_minutes");
    expect(values.meeting_id).toBe("meeting-1");
    expect(values.body_text).toBe("Carried over from the agenda.");
    expect(values.agenda_snapshot.items.map((item) => item.key)).toContain(
      "section:finance_fundraising",
    );
  });

  test("falls back to the first active template when the agenda pins none", async () => {
    const supabase = starting({
      select: {
        governance_meetings: { rows: [MEETING] },
        agendas: { rows: [] },
        agenda_templates: {
          rows: [
            {
              agenda_template_versions: {
                sections: [{ key: "events", label: "Events", topics: [] }],
              },
            },
          ],
        },
      },
    });

    const result = await startMinutesFromAgenda(supabase.client, "meeting-1");

    expect(result).toMatchObject({ success: true });
    const insert = supabase.statements.find(
      (statement) => statement.operation === "insert",
    );
    const values = insert?.values as {
      body_text: string | null;
      agenda_snapshot: { items: { key: string }[] };
    };
    expect(values.body_text).toBeNull();
    expect(values.agenda_snapshot.items.map((item) => item.key)).toContain(
      "section:events",
    );
  });

  test("a second start is a conflict, not a second snapshot", async () => {
    const supabase = starting({
      insert: {
        meeting_minutes: {
          error: { message: "duplicate key value", code: "23505" },
        },
      },
    });

    expect(await startMinutesFromAgenda(supabase.client, "meeting-1")).toEqual({
      error: {
        code: "conflict",
        message: "Minutes have already been started for this meeting.",
      },
    });
  });

  test("a meeting that is gone is a conflict, not a server error", async () => {
    const supabase = starting({
      select: { governance_meetings: { rows: [] } },
    });

    expect(await startMinutesFromAgenda(supabase.client, "meeting-1")).toEqual({
      error: { code: "conflict", message: "That meeting no longer exists." },
    });
  });
});

describe("saveMinutesDraft", () => {
  test("sends one merge RPC and returns the new updated_at", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      rpc: {
        save_meeting_minutes_draft: { data: "2026-03-18T19:41:00.000Z" },
      },
    });

    const result = await saveMinutesDraft(supabase.client, "meeting-1", {
      notes: { opening: "Quorum met." },
    });

    expect(result).toEqual({
      success: true,
      savedAt: "2026-03-18T19:41:00.000Z",
    });
    const call = supabase.rpcCalls.find(
      (rpcCall) => rpcCall.name === "save_meeting_minutes_draft",
    );
    expect(call?.args).toEqual({
      p_meeting_id: "meeting-1",
      p_notes: { opening: "Quorum met." },
      p_body_text: null,
      // Absent from the patch, so the RPC leaves body_text where it is.
      p_body_text_set: false,
    });
  });

  test("a patch that clears the closing notes says so explicitly", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      rpc: { save_meeting_minutes_draft: { data: "2026-03-18T19:41:00.000Z" } },
    });

    await saveMinutesDraft(supabase.client, "meeting-1", {
      notes: {},
      body_text: "",
    });

    const call = supabase.rpcCalls.find(
      (rpcCall) => rpcCall.name === "save_meeting_minutes_draft",
    );
    expect(call?.args).toMatchObject({
      p_body_text: "",
      p_body_text_set: true,
    });
  });

  test("no row back means there is no draft to write to", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      rpc: { save_meeting_minutes_draft: { data: null } },
    });

    expect(
      await saveMinutesDraft(supabase.client, "meeting-1", { notes: {} }),
    ).toEqual({
      error: {
        code: "conflict",
        message: "These minutes are final — reopen them to make changes.",
      },
    });
  });

  test("refuses a caller with governance:view only", async () => {
    const supabase = fakeSupabase({ permissions: VIEW });

    expect(
      await saveMinutesDraft(supabase.client, "meeting-1", { notes: {} }),
    ).toEqual(FORBIDDEN);
    expect(
      supabase.rpcCalls.some(
        (call) => call.name === "save_meeting_minutes_draft",
      ),
    ).toBe(false);
  });
});

describe("finalizeMinutes and reopenMinutes", () => {
  test("finalize stamps the finisher and only touches a draft", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      update: { meeting_minutes: { rows: [{ id: "minutes-1" }] } },
    });

    expect(await finalizeMinutes(supabase.client, "meeting-1")).toEqual({
      success: true,
    });
    const [update] = supabase.statements;
    const values = update.values as {
      status: string;
      finalized_at: string;
      finalized_by: string;
    };
    expect(values.status).toBe("final");
    expect(values.finalized_by).toBe("user-1");
    expect(Number.isNaN(Date.parse(values.finalized_at))).toBe(false);
    expect(update.filters).toContainEqual({
      method: "eq",
      args: ["status", "draft"],
    });
  });

  test("finalizing what is already final is a conflict", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      update: { meeting_minutes: { rows: [] } },
    });

    expect(await finalizeMinutes(supabase.client, "meeting-1")).toEqual({
      error: {
        code: "conflict",
        message: "There are no draft minutes to finalize for this meeting.",
      },
    });
  });

  test("reopen clears the finalizer and only touches a final row", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      update: { meeting_minutes: { rows: [{ id: "minutes-1" }] } },
    });

    expect(await reopenMinutes(supabase.client, "meeting-1")).toEqual({
      success: true,
    });
    const [update] = supabase.statements;
    expect(update.values).toMatchObject({
      status: "draft",
      finalized_at: null,
      finalized_by: null,
    });
    expect(update.filters).toContainEqual({
      method: "eq",
      args: ["status", "final"],
    });
  });

  test("reopening a draft is a conflict", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      update: { meeting_minutes: { rows: [] } },
    });

    expect(await reopenMinutes(supabase.client, "meeting-1")).toEqual({
      error: {
        code: "conflict",
        message: "There are no finalized minutes to reopen for this meeting.",
      },
    });
  });

  test("both refuse a caller with governance:view only", async () => {
    const supabase = fakeSupabase({ permissions: VIEW });

    expect(await finalizeMinutes(supabase.client, "meeting-1")).toEqual(
      FORBIDDEN,
    );
    expect(await reopenMinutes(supabase.client, "meeting-1")).toEqual(
      FORBIDDEN,
    );
    expect(supabase.statements).toEqual([]);
  });
});
