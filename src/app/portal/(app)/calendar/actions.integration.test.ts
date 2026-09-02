// Integration test: exercises the real calendar_items Server Actions against
// a real local Supabase stack (checkPermission, then real `calendar_items`
// RLS). content_calendar's entitlement matrix (20260824000000) mirrors
// `programs`, not the events split: admin AND event_coordinator get manage,
// while finance, board, and volunteer all get view -- so every portal role
// can read the calendar but only the two manage roles can change it.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createCalendarItemAction,
  updateCalendarItemAction,
  updateCalendarItemsVisibilityAction,
  updateCalendarItemsStatusAction,
  updateCalendarItemsDecisionAction,
  deleteCalendarItemAction,
  duplicateCalendarItemAction,
  archiveCalendarItemAction,
  restoreCalendarItemAction,
  recordSensitiveTopicReviewAction,
  listCalendarOwnersAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function calendarItemForm(overrides: { title?: string } = {}) {
  const fd = new FormData();
  fd.set(
    "title",
    overrides.title ?? `Integration test calendar item ${crypto.randomUUID()}`,
  );
  fd.set("itemType", "community_observance");
  fd.set("startsAt", "2026-11-01T10:00");
  fd.set("timeZone", "America/Denver");
  fd.set("priorityTier", "3");
  fd.set("calendarStatus", "idea");
  fd.set("visibility", "internal");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function findItemIdByTitle(title: string) {
  const { data, error } = await adminClient
    .from("calendar_items")
    .select("id")
    .eq("title", title)
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("calendar item actions (integration)", () => {
  test("requires a signed-in user to create a calendar item", async () => {
    currentSupabase = anonClient();
    expect(await createCalendarItemAction(calendarItemForm())).toEqual({
      error: "You must be signed in to create a calendar item.",
    });
  });

  test("admin role (content_calendar manage) can create, update, and delete an item", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const title = `Integration test calendar item ${crypto.randomUUID()}`;

    expect(await createCalendarItemAction(calendarItemForm({ title }))).toEqual(
      { success: true },
    );
    const id = await findItemIdByTitle(title);

    const updatedTitle = `${title} (updated)`;
    expect(
      await updateCalendarItemAction(
        id,
        calendarItemForm({ title: updatedTitle }),
      ),
    ).toEqual({ success: true });
    const { data: updated } = await adminClient
      .from("calendar_items")
      .select("title")
      .eq("id", id)
      .single();
    expect(updated?.title).toBe(updatedTitle);

    expect(await deleteCalendarItemAction(id)).toEqual({ success: true });
    const { data: afterDelete } = await adminClient
      .from("calendar_items")
      .select("id")
      .eq("id", id);
    expect(afterDelete).toHaveLength(0);
  });

  test("admin role can run the bulk visibility/status/decision actions", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateCalendarItemsVisibilityAction([item.id], "public"),
    ).toEqual({ success: true });
    expect(await updateCalendarItemsStatusAction([item.id], "active")).toEqual({
      success: true,
    });
    expect(await updateCalendarItemsDecisionAction([item.id], "plan")).toEqual({
      success: true,
    });

    const { data } = await adminClient
      .from("calendar_items")
      .select("visibility, calendar_status, decision")
      .eq("id", item.id)
      .single();
    expect(data).toEqual({
      visibility: "public",
      calendar_status: "active",
      decision: "plan",
    });

    await item.cleanup();
  });

  test("admin role can duplicate, archive, and restore an item", async () => {
    const title = `Integration test calendar item ${crypto.randomUUID()}`;
    const item = await createCalendarItem({ title });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await duplicateCalendarItemAction(item.id)).toEqual({
      success: true,
    });
    const copyId = await findItemIdByTitle(`${title} (copy)`);

    expect(await archiveCalendarItemAction(item.id)).toEqual({ success: true });
    const { data: archived } = await adminClient
      .from("calendar_items")
      .select("calendar_status")
      .eq("id", item.id)
      .single();
    expect(archived?.calendar_status).toBe("archived");

    expect(await restoreCalendarItemAction(item.id)).toEqual({ success: true });
    const { data: restored } = await adminClient
      .from("calendar_items")
      .select("calendar_status")
      .eq("id", item.id)
      .single();
    expect(restored?.calendar_status).toBe("active");

    await adminClient.from("calendar_items").delete().eq("id", copyId);
    await item.cleanup();
  });

  test("admin role can record sensitive-topic review sign-off", async () => {
    const item = await createCalendarItem({
      isSensitiveTopic: true,
      toneGuidance: "Center community voices.",
    });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await recordSensitiveTopicReviewAction(item.id)).toEqual({
      success: true,
    });
    const { data } = await adminClient
      .from("calendar_items")
      .select("sensitive_review_by")
      .eq("id", item.id)
      .single();
    expect(data?.sensitive_review_by).not.toBeNull();

    await item.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can create an item", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const title = `Integration test calendar item ${crypto.randomUUID()}`;

    expect(await createCalendarItemAction(calendarItemForm({ title }))).toEqual(
      { success: true },
    );

    const id = await findItemIdByTitle(title);
    await adminClient.from("calendar_items").delete().eq("id", id);
  });

  test("finance role (content_calendar view only) can list owners but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listCalendarOwnersAction())).toBe(true);
    expect(await createCalendarItemAction(calendarItemForm())).toEqual(DENIED);
    expect(
      await updateCalendarItemAction(crypto.randomUUID(), calendarItemForm()),
    ).toEqual(DENIED);
    expect(await deleteCalendarItemAction(crypto.randomUUID())).toEqual(DENIED);
    expect(
      await updateCalendarItemsVisibilityAction(
        [crypto.randomUUID()],
        "public",
      ),
    ).toEqual(DENIED);
  });

  test("board role (content_calendar view only) can list owners but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect("data" in (await listCalendarOwnersAction())).toBe(true);
    expect(await createCalendarItemAction(calendarItemForm())).toEqual(DENIED);
    expect(await duplicateCalendarItemAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
    expect(await archiveCalendarItemAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
  });

  test("volunteer role (content_calendar view only) can list owners but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listCalendarOwnersAction())).toBe(true);
    expect(await createCalendarItemAction(calendarItemForm())).toEqual(DENIED);
    expect(
      await updateCalendarItemsStatusAction([crypto.randomUUID()], "active"),
    ).toEqual(DENIED);
    expect(await recordSensitiveTopicReviewAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
    expect(await restoreCalendarItemAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
  });

  test("a no-role account can neither list owners nor create an item", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await listCalendarOwnersAction()).toEqual(DENIED);
    expect(await createCalendarItemAction(calendarItemForm())).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create an item", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(await createCalendarItemAction(calendarItemForm())).toEqual(DENIED);
  });
});
