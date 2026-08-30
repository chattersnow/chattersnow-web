// Integration test: exercises the real event checklist Server Actions
// against a real local Supabase stack (checkPermission, then real
// `event_checklist_items` RLS + the shared set_updated_at trigger).
// `event_checklist_items` is gated on the shared `events` resource -- select
// on events:view, writes on events:manage (20260830030000) -- so the
// interesting cases are the view-only roles (finance, volunteer), which can
// read the checklist but must not be able to change it. The toggle case in
// particular caught a real bug: the table was missing the `updated_by`
// column set_updated_at() now writes on every UPDATE, which a mocked unit
// test can't see since it never runs a real trigger.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventChecklistItemsAction,
  createEventChecklistItemAction,
  toggleEventChecklistItemAction,
  deleteEventChecklistItemAction,
} = await import("./checklist-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function checklistForm(title = "Buy supplies") {
  const fd = new FormData();
  fd.set("title", title);
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("event checklist actions (integration)", () => {
  test("requires a signed-in user to add a checklist item", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    const result = await createEventChecklistItemAction(
      event.id,
      checklistForm(),
    );
    expect(result).toEqual({
      error: "You must be signed in to add a checklist item.",
    });

    await event.cleanup();
  });

  test("admin role (events manage) can create, list, toggle, and delete a checklist item", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual({ success: true });

    const listed = await listEventChecklistItemsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].is_done).toBe(false);
    expect(listed.data[0].completed_at).toBeNull();

    // Regression coverage for the missing `updated_by` column bug: this is
    // the only action here that runs an UPDATE, which is what the
    // set_updated_at trigger touches.
    expect(
      await toggleEventChecklistItemAction(listed.data[0].id, true),
    ).toEqual({ success: true });

    const afterToggle = await listEventChecklistItemsAction(event.id);
    if (!("data" in afterToggle)) throw new Error("expected data");
    expect(afterToggle.data[0].is_done).toBe(true);
    expect(afterToggle.data[0].completed_at).not.toBeNull();

    expect(
      await toggleEventChecklistItemAction(listed.data[0].id, false),
    ).toEqual({ success: true });

    const afterUntoggle = await listEventChecklistItemsAction(event.id);
    if (!("data" in afterUntoggle)) throw new Error("expected data");
    expect(afterUntoggle.data[0].is_done).toBe(false);
    expect(afterUntoggle.data[0].completed_at).toBeNull();

    expect(await deleteEventChecklistItemAction(listed.data[0].id)).toEqual({
      success: true,
    });

    const afterDelete = await listEventChecklistItemsAction(event.id);
    if (!("data" in afterDelete)) throw new Error("expected data");
    expect(afterDelete.data).toHaveLength(0);

    await event.cleanup();
  });

  test("event_coordinator role (events manage) can add a checklist item", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual({ success: true });

    await event.cleanup();
  });

  test("finance role (events view only) can list but not write checklist items", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventChecklistItemsAction(event.id))).toBe(
      true,
    );
    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual(DENIED);
    expect(
      await toggleEventChecklistItemAction(crypto.randomUUID(), true),
    ).toEqual(DENIED);
    expect(await deleteEventChecklistItemAction(crypto.randomUUID())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("volunteer role (events view only) can list but not add checklist items", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listEventChecklistItemsAction(event.id))).toBe(
      true,
    );
    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither list nor add checklist items", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventChecklistItemsAction(event.id)).toEqual(DENIED);
    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual(DENIED);

    await event.cleanup();
  });

  test("a deactivated (former) account cannot add a checklist item", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(
      await createEventChecklistItemAction(event.id, checklistForm()),
    ).toEqual(DENIED);

    await event.cleanup();
  });
});
