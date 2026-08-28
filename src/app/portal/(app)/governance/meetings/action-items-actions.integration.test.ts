// Integration test: exercises the real meeting action item Server Actions
// against a real local Supabase stack (checkUser/checkPermission, then real
// `governance_meeting_action_items` RLS). actions.integration.test.ts covers
// the parent `governance_meetings` row only -- the child action items have
// their own action file, and every read here (including the carried-over
// lookup, which joins back to `governance_meetings`) is gated by
// governance:manage rather than the 'view' the table's select policy allows.
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
  listActionItemsAction,
  listCarriedOverActionItemsAction,
  createActionItemAction,
  updateActionItemAction,
  updateActionItemStatusAction,
  deleteActionItemAction,
} = await import("./action-items-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function actionItemForm(
  overrides: { description?: string; status?: string; dueDate?: string } = {},
) {
  const fd = new FormData();
  fd.set("description", overrides.description ?? "Draft the annual report");
  fd.set("dueDate", overrides.dueDate ?? "2026-06-30");
  fd.set("status", overrides.status ?? "open");
  return fd;
}

async function actionItemsFor(meetingId: string) {
  const { data, error } = await adminClient
    .from("governance_meeting_action_items")
    .select("id, description, due_date, status, owner_person_id")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  return data;
}

// Seeds one action item via the real action (as admin) so denied-role cases
// have an existing row to attempt an update/delete against.
async function seedActionItem(meetingId: string, ownerPersonId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createActionItemAction(
    meetingId,
    ownerPersonId,
    actionItemForm(),
  );
  if ("error" in result) throw new Error(result.error);
  const items = await actionItemsFor(meetingId);
  if (items.length !== 1) throw new Error("expected one seeded action item");
  return items[0].id as string;
}

describe("meeting action item actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createActionItemAction(
        crypto.randomUUID(),
        crypto.randomUUID(),
        actionItemForm(),
      ),
    ).toEqual({ error: "You must be signed in to add an action item." });
    expect(
      await updateActionItemAction(
        crypto.randomUUID(),
        crypto.randomUUID(),
        actionItemForm(),
      ),
    ).toEqual({ error: "You must be signed in to update this action item." });
    expect(
      await updateActionItemStatusAction(crypto.randomUUID(), "done"),
    ).toEqual({ error: "You must be signed in to update this action item." });
    expect(await deleteActionItemAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove this action item.",
    });
    // The two list actions have no checkUser guard -- an anonymous client
    // holds no permissions, so they fall through to the permission check.
    expect(await listActionItemsAction(crypto.randomUUID())).toEqual(DENIED);
    expect(
      await listCarriedOverActionItemsAction(
        crypto.randomUUID(),
        new Date().toISOString(),
      ),
    ).toEqual(DENIED);
  });

  test("admin role (governance manage) can add, list, update, re-status and remove an action item", async () => {
    const meeting = await createGovernanceMeeting();
    const owner = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createActionItemAction(meeting.id, owner.id, actionItemForm()),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const listed = await listActionItemsAction(meeting.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      description: "Draft the annual report",
      due_date: "2026-06-30",
      status: "open",
    });
    expect(listed.data[0].owner.id).toBe(owner.id);

    const itemId = listed.data[0].id;
    expect(
      await updateActionItemAction(
        itemId,
        owner.id,
        actionItemForm({
          description: "Draft and circulate the annual report",
        }),
      ),
    ).toEqual({ success: true });
    expect(await updateActionItemStatusAction(itemId, "done")).toEqual({
      success: true,
    });

    const afterUpdates = await actionItemsFor(meeting.id);
    expect(afterUpdates[0]).toMatchObject({
      description: "Draft and circulate the annual report",
      status: "done",
    });

    expect(await deleteActionItemAction(itemId)).toEqual({ success: true });
    expect(await actionItemsFor(meeting.id)).toHaveLength(0);

    await meeting.cleanup();
    await owner.cleanup();
  });

  test("board role (governance manage) sees open items from earlier meetings as carried over", async () => {
    const earlier = await createGovernanceMeeting({
      meetingDate: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    const current = await createGovernanceMeeting();
    const owner = await createPerson();
    await seedActionItem(earlier.id, owner.id);

    currentSupabase = await signInAs(SEEDED_USERS.board);
    const carried = await listCarriedOverActionItemsAction(
      current.id,
      new Date().toISOString(),
    );
    if (!("data" in carried)) throw new Error("expected data");
    expect(carried.data.some((item) => item.meeting_id === earlier.id)).toBe(
      true,
    );

    // A done item is no longer carried over.
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const items = await actionItemsFor(earlier.id);
    expect(
      await updateActionItemStatusAction(items[0].id as string, "done"),
    ).toEqual({ success: true });

    currentSupabase = await signInAs(SEEDED_USERS.board);
    const afterDone = await listCarriedOverActionItemsAction(
      current.id,
      new Date().toISOString(),
    );
    if (!("data" in afterDone)) throw new Error("expected data");
    expect(afterDone.data.some((item) => item.meeting_id === earlier.id)).toBe(
      false,
    );

    await earlier.cleanup();
    await current.cleanup();
    await owner.cleanup();
  });

  test("requires an owner, even for a permitted role", async () => {
    const meeting = await createGovernanceMeeting();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createActionItemAction(meeting.id, "", actionItemForm()),
    ).toEqual({ error: "Select or create an owner for this action item." });

    await meeting.cleanup();
  });

  async function expectNoAccess(email: string) {
    const meeting = await createGovernanceMeeting();
    const owner = await createPerson();
    const itemId = await seedActionItem(meeting.id, owner.id);
    currentSupabase = await signInAs(email);

    expect(await listActionItemsAction(meeting.id)).toEqual(DENIED);
    expect(
      await listCarriedOverActionItemsAction(
        meeting.id,
        new Date().toISOString(),
      ),
    ).toEqual(DENIED);
    expect(
      await createActionItemAction(meeting.id, owner.id, actionItemForm()),
    ).toEqual(DENIED);
    expect(
      await updateActionItemAction(
        itemId,
        owner.id,
        actionItemForm({ description: "Rewritten by an unauthorized role" }),
      ),
    ).toEqual(DENIED);
    expect(await updateActionItemStatusAction(itemId, "done")).toEqual(DENIED);
    expect(await deleteActionItemAction(itemId)).toEqual(DENIED);

    // None of the denied writes landed: the actions refuse them, and the
    // table's RLS policies would too.
    const remaining = await actionItemsFor(meeting.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      description: "Draft the annual report",
      status: "open",
    });

    await meeting.cleanup();
    await owner.cleanup();
  }

  test("event_coordinator role has no access to action items", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role has no access to action items", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role has no access to action items", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account has no access to action items", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
