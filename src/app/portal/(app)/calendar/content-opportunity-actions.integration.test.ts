// Integration test: exercises the real content-piece Server Actions against a
// real local Supabase stack (checkPermission, then real
// `content_opportunities` RLS -- same content_calendar resource as
// calendar_items: admin/event_coordinator manage, finance/board/volunteer
// view). Requires `bun run db:start && bun run db:reset` first; run via
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
  createContentPieceAction,
  updateContentPieceAction,
  deleteContentPieceAction,
} = await import("./content-opportunity-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function pieceForm(overrides: { title?: string; internalNotes?: string } = {}) {
  const fd = new FormData();
  fd.set("title", overrides.title ?? "Instagram carousel");
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  if (overrides.internalNotes) fd.set("internalNotes", overrides.internalNotes);
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("content piece actions (integration)", () => {
  test("requires a signed-in user to add a content piece", async () => {
    currentSupabase = anonClient();
    expect(
      await createContentPieceAction(crypto.randomUUID(), pieceForm()),
    ).toEqual({ error: "You must be signed in to add a content piece." });
  });

  test("admin role (content_calendar manage) can add, update and delete pieces", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Two pieces on the one item: what the dropped unique constraint used to
    // refuse, and the whole point of #1231.
    expect(await createContentPieceAction(item.id, pieceForm())).toEqual({
      success: true,
    });
    expect(
      await createContentPieceAction(
        item.id,
        pieceForm({ title: "Email to past participants" }),
      ),
    ).toEqual({ success: true });

    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id, title, content_status")
      .eq("calendar_item_id", item.id)
      .order("created_at", { ascending: true });
    expect(created?.map((piece) => piece.title)).toEqual([
      "Instagram carousel",
      "Email to past participants",
    ]);
    expect(created?.[0].content_status).toBe("idea");

    expect(
      await updateContentPieceAction(
        created![0].id,
        pieceForm({ internalNotes: "Updated in integration test" }),
      ),
    ).toEqual({ success: true });

    const { data: updated } = await adminClient
      .from("content_opportunities")
      .select("internal_notes")
      .eq("id", created![0].id)
      .single();
    expect(updated?.internal_notes).toBe("Updated in integration test");

    expect(await deleteContentPieceAction(created![1].id)).toEqual({
      success: true,
    });
    const { count } = await adminClient
      .from("content_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("calendar_item_id", item.id);
    expect(count).toBe(1);

    await item.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createContentPieceAction(item.id, pieceForm())).toEqual({
      success: true,
    });

    await item.cleanup();
  });

  test("finance role (content_calendar view only) cannot add, update or delete a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(await createContentPieceAction(item.id, pieceForm())).toEqual(
      DENIED,
    );
    expect(
      await updateContentPieceAction(crypto.randomUUID(), pieceForm()),
    ).toEqual(DENIED);
    expect(await deleteContentPieceAction(crypto.randomUUID())).toEqual(DENIED);

    await item.cleanup();
  });

  test("board role (content_calendar view only) cannot add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createContentPieceAction(item.id, pieceForm())).toEqual(
      DENIED,
    );

    await item.cleanup();
  });

  test("volunteer role (content_calendar view only) cannot add a piece", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await createContentPieceAction(item.id, pieceForm())).toEqual(
      DENIED,
    );

    await item.cleanup();
  });

  test("a deactivated (former) account cannot add a piece", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await createContentPieceAction(crypto.randomUUID(), pieceForm()),
    ).toEqual(DENIED);
  });
});
