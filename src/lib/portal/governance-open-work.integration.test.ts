// Integration test: Governance's Open work union query (#1658) and the inline
// actions it drives, against a real local Supabase stack -- the five source
// tables' real RLS, the real resolve_current_person_id RPC behind "Mine", and
// the existing Server Actions fed the forms Open work builds. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createGovernanceMeeting,
  createPerson,
  signInAs,
} from "../../../test/integration-setup";
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "./task-list";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getGovernanceOpenWork } = await import("./governance-open-work");
const { updateActionItemAction, updateActionItemStatusAction } =
  await import("@/app/portal/(app)/governance/meetings/action-items-actions");
const { updateMilestoneAction, updateMilestoneStatusAction } =
  await import("@/app/portal/(app)/governance/nonprofit-status/nonprofit-status-actions");
const { updateAnnualRequirementAction, updateAnnualRequirementStatusAction } =
  await import("@/app/portal/(app)/governance/annual-requirements/annual-requirements-actions");
const { actionItemFormData, annualRequirementFormData, milestoneFormData } =
  await import("@/app/portal/(app)/governance/open-work/open-work-forms");

// A fixed day, so "overdue" and "this week" don't depend on when CI runs.
const TODAY = "2031-03-10";
const tag = crypto.randomUUID().slice(0, 8);

let board: SupabaseClient;
let boardPersonId: string;
let other: Awaited<ReturnType<typeof createPerson>>;
let org: Awaited<ReturnType<typeof createPerson>>;
let meeting: Awaited<ReturnType<typeof createGovernanceMeeting>>;

// Fixture ids by name, so assertions read as the scenario rather than uuids.
const ids: Record<string, string> = {};

async function insert(
  table: string,
  name: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  ids[name] = data.id as string;
}

beforeAll(async () => {
  board = await signInAs(SEEDED_USERS.board);
  const { data: personId, error } = await board.rpc(
    "resolve_current_person_id",
  );
  if (error || !personId) throw new Error("board user has no people row");
  boardPersonId = personId as string;

  other = await createPerson({ name: `IT Open Work Owner ${tag}` });
  org = await createPerson({
    name: `IT Open Work Org ${tag}`,
    person_type: "organization",
  });
  meeting = await createGovernanceMeeting();

  await insert("governance_meeting_action_items", "actionOverdueMine", {
    meeting_id: meeting.id,
    owner_person_id: boardPersonId,
    description: `IT action overdue ${tag}`,
    due_date: "2031-03-01",
    status: "open",
    minutes_item_key: "section:finance_fundraising",
  });
  await insert("governance_meeting_action_items", "actionDone", {
    meeting_id: meeting.id,
    owner_person_id: other.id,
    description: `IT action done ${tag}`,
    due_date: "2031-02-01",
    status: "done",
  });
  await insert("nonprofit_status_milestones", "milestoneUnowned", {
    description: `IT milestone ${tag}`,
    phase: "federal",
    status: "in_progress",
    due_date: null,
    notes: "Keep these notes",
    sort_order: 100000,
  });
  await insert("nonprofit_status_milestones", "milestoneCancelled", {
    description: `IT milestone cancelled ${tag}`,
    phase: "federal",
    status: "cancelled",
    due_date: "2031-03-11",
    sort_order: 100001,
  });
  await insert("annual_requirements", "requirementThisWeek", {
    name: `IT requirement ${tag}`,
    due_date: "2031-03-14",
    status: "not_started",
    responsible_person_id: other.id,
    external_link: "https://example.test/filing",
    body_text: "Keep this text",
  });
  await insert("grants", "grantPlanned", {
    funder_name: `IT funder ${tag}`,
    application_deadline: "2031-04-01",
    status: "planned",
    owner_person_id: boardPersonId,
  });
  await insert("grants", "grantSubmitted", {
    funder_name: `IT funder submitted ${tag}`,
    application_deadline: "2031-03-12",
    status: "submitted",
  });
  await insert("partnership_opportunities", "partnershipOpen", {
    organization_person_id: org.id,
    stage: "contacted",
    next_step_date: "2031-03-09",
    owner_person_id: other.id,
  });
  await insert("partnership_opportunities", "partnershipWon", {
    organization_person_id: org.id,
    stage: "closed_won",
    next_step_date: "2031-03-20",
  });
  await insert("partnership_opportunities", "partnershipUndated", {
    organization_person_id: org.id,
    stage: "prospecting",
    next_step_date: null,
  });
});

afterAll(async () => {
  await adminClient
    .from("nonprofit_status_milestones")
    .delete()
    .in("id", [ids.milestoneUnowned, ids.milestoneCancelled]);
  await adminClient
    .from("annual_requirements")
    .delete()
    .eq("id", ids.requirementThisWeek);
  await adminClient
    .from("grants")
    .delete()
    .in("id", [ids.grantPlanned, ids.grantSubmitted]);
  await adminClient
    .from("partnership_opportunities")
    .delete()
    .in("id", [
      ids.partnershipOpen,
      ids.partnershipWon,
      ids.partnershipUndated,
    ]);
  // Cascades to the action items.
  await meeting.cleanup();
  await other.cleanup();
  await org.cleanup();
});

/** The fixture names Open work returns for `filters`, in its order. */
async function openWork(
  filters: Partial<TaskFilters> = {},
  as: SupabaseClient = board,
) {
  const result = await getGovernanceOpenWork(
    as,
    { ...DEFAULT_TASK_FILTERS, ...filters },
    { canEdit: true, today: TODAY },
  );
  const names = Object.fromEntries(
    Object.entries(ids).map(([name, id]) => [id, name]),
  );
  return {
    names: result.rows
      .filter((row) => names[row.id])
      .map((row) => names[row.id]),
    result,
  };
}

describe("getGovernanceOpenWork", () => {
  test("lists open work from every source, overdue first", async () => {
    const { names, result } = await openWork();
    expect(names).toEqual([
      "actionOverdueMine",
      "partnershipOpen",
      "requirementThisWeek",
      "grantPlanned",
      "milestoneUnowned",
    ]);

    const action = result.rows.find((row) => row.id === ids.actionOverdueMine)!;
    expect(action.kind).toBe("action_item");
    expect(action.owner?.id).toBe(boardPersonId);
    expect(action.dueDate).toBe("2031-03-01");
    expect(action.source.href).toBe(
      `/portal/governance/meetings/${meeting.id}#action-items-section`,
    );
    expect(action.source.label).toMatch(/^Board meeting, /);

    const partnership = result.rows.find(
      (row) => row.id === ids.partnershipOpen,
    )!;
    expect(partnership.title).toBe(`IT Open Work Org ${tag}`);
    expect(partnership.statusLabel).toBe("Contacted");
  });

  test("status: done shows finished rows, never a grant", async () => {
    const { names } = await openWork({ status: "done" });
    expect(names.sort()).toEqual(
      ["actionDone", "milestoneCancelled", "partnershipWon"].sort(),
    );
  });

  test("status: all shows both", async () => {
    const { names } = await openWork({ status: "all" });
    expect(names).toHaveLength(8);
    expect(names).not.toContain("grantSubmitted");
    expect(names).not.toContain("partnershipUndated");
  });

  test("owner: Mine resolves through the signed-in user's people row", async () => {
    const { names } = await openWork({ owner: "mine" });
    expect(names).toEqual(["actionOverdueMine", "grantPlanned"]);
  });

  test("owner: a person, and unassigned", async () => {
    expect((await openWork({ owner: other.id })).names).toEqual([
      "partnershipOpen",
      "requirementThisWeek",
    ]);
    expect((await openWork({ owner: "unassigned" })).names).toEqual([
      "milestoneUnowned",
    ]);
  });

  test("owner options come from the rows", async () => {
    const { result } = await openWork({ owner: other.id });
    const ownerIds = result.owners.map((owner) => owner.id);
    expect(ownerIds).toContain(other.id);
    expect(ownerIds).toContain(boardPersonId);
  });

  test("type filter", async () => {
    expect((await openWork({ type: "grant" })).names).toEqual(["grantPlanned"]);
    expect((await openWork({ type: "milestone" })).names).toEqual([
      "milestoneUnowned",
    ]);
    expect((await openWork({ type: "annual_requirement" })).names).toEqual([
      "requirementThisWeek",
    ]);
    expect((await openWork({ type: "partnership" })).names).toEqual([
      "partnershipOpen",
    ]);
    expect((await openWork({ type: "action_item" })).names).toEqual([
      "actionOverdueMine",
    ]);
  });

  test("due filter: overdue and this week", async () => {
    expect((await openWork({ due: "overdue" })).names).toEqual([
      "actionOverdueMine",
      "partnershipOpen",
    ]);
    expect((await openWork({ due: "week" })).names).toEqual([
      "requirementThisWeek",
    ]);
  });

  test("a reader without governance access sees none of it", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { names } = await openWork({ status: "all" }, volunteer);
    expect(names).toEqual([]);
  });
});

describe("inline actions through the existing Server Actions", () => {
  test("action item: re-date and reassign keep its description and minutes link", async () => {
    currentSupabase = board;
    const { result } = await openWork({ type: "action_item" });
    const row = result.rows.find((r) => r.id === ids.actionOverdueMine)!;
    if (row.kind !== "action_item") throw new Error("expected an action item");

    const saved = await updateActionItemAction(
      row.id,
      other.id,
      actionItemFormData(row.record, { dueDate: "2031-03-20" }),
    );
    expect(saved).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const { data } = await adminClient
      .from("governance_meeting_action_items")
      .select("description, due_date, owner_person_id, minutes_item_key")
      .eq("id", row.id)
      .single();
    expect(data).toEqual({
      description: `IT action overdue ${tag}`,
      due_date: "2031-03-20",
      owner_person_id: other.id,
      minutes_item_key: "section:finance_fundraising",
    });
    expect((await openWork({ due: "overdue" })).names).not.toContain(
      "actionOverdueMine",
    );
  });

  test("action item: mark done, then reopen", async () => {
    currentSupabase = board;
    expect(
      await updateActionItemStatusAction(ids.actionOverdueMine, "done"),
    ).toEqual({ success: true });
    expect((await openWork()).names).not.toContain("actionOverdueMine");
    expect((await openWork({ status: "done" })).names).toContain(
      "actionOverdueMine",
    );

    await updateActionItemStatusAction(ids.actionOverdueMine, "open");
    expect((await openWork()).names).toContain("actionOverdueMine");
  });

  test("milestone: reassign keeps phase and notes; status moves it to done", async () => {
    currentSupabase = board;
    const { result } = await openWork({ type: "milestone" });
    const row = result.rows.find((r) => r.id === ids.milestoneUnowned)!;
    if (row.kind !== "milestone") throw new Error("expected a milestone");

    expect(
      await updateMilestoneAction(
        row.id,
        boardPersonId,
        milestoneFormData(row.record, { dueDate: "2031-05-01" }),
      ),
    ).toEqual({ success: true });

    const { data } = await adminClient
      .from("nonprofit_status_milestones")
      .select("phase, notes, due_date, owner_person_id, status")
      .eq("id", row.id)
      .single();
    expect(data).toEqual({
      phase: "federal",
      notes: "Keep these notes",
      due_date: "2031-05-01",
      owner_person_id: boardPersonId,
      status: "in_progress",
    });
    expect((await openWork({ owner: "mine" })).names).toContain(
      "milestoneUnowned",
    );

    await updateMilestoneStatusAction(row.id, "done");
    expect((await openWork()).names).not.toContain("milestoneUnowned");
  });

  test("annual requirement: reassign keeps its document and text; status stamps completion", async () => {
    currentSupabase = board;
    const { result } = await openWork({ type: "annual_requirement" });
    const row = result.rows.find((r) => r.id === ids.requirementThisWeek)!;
    if (row.kind !== "annual_requirement") {
      throw new Error("expected an annual requirement");
    }

    expect(
      await updateAnnualRequirementAction(
        row.id,
        null,
        annualRequirementFormData(row.record, { dueDate: "2031-03-30" }),
      ),
    ).toEqual({ success: true });

    const { data } = await adminClient
      .from("annual_requirements")
      .select(
        "due_date, responsible_person_id, external_link, body_text, status",
      )
      .eq("id", row.id)
      .single();
    expect(data).toEqual({
      due_date: "2031-03-30",
      responsible_person_id: null,
      external_link: "https://example.test/filing",
      body_text: "Keep this text",
      status: "not_started",
    });

    // The parser still refuses a cleared due date.
    const refused = await updateAnnualRequirementAction(
      row.id,
      null,
      annualRequirementFormData(row.record, { dueDate: null }),
    );
    expect(refused).toEqual({ error: "Due date is required." });

    await updateAnnualRequirementStatusAction(row.id, "done");
    const { data: done } = await adminClient
      .from("annual_requirements")
      .select("completed_at")
      .eq("id", row.id)
      .single();
    expect(done?.completed_at).not.toBeNull();
    expect((await openWork({ status: "done" })).names).toContain(
      "requirementThisWeek",
    );
  });
});
