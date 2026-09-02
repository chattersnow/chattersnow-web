// Integration test: exercises the real related-items Server Actions against
// a real local Supabase stack (checkPermission, then real
// `calendar_item_links` RLS -- content_calendar: admin/event_coordinator
// manage, finance/board/volunteer view). Candidate listing is a view-level
// action, so the interesting cases are the view-only roles, which can see
// suggestions but must not be able to link or unlink. Requires `bun run
// db:start && bun run db:reset` first; run via `bun run test:integration`.
// Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
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
  listRelatedCalendarItemCandidatesAction,
  linkCalendarItemsAction,
  unlinkCalendarItemsAction,
} = await import("./related-items-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// Two items sharing a category and an item_type, so each scores as a
// suggestion for the other.
async function createItemPair() {
  const a = await createCalendarItem({
    categories: ["winter_outdoor_sports"],
  });
  const b = await createCalendarItem({
    categories: ["winter_outdoor_sports"],
  });
  return {
    a,
    b,
    async cleanup() {
      await a.cleanup();
      await b.cleanup();
    },
  };
}

describe("related calendar item actions (integration)", () => {
  test("requires a signed-in user to link items", async () => {
    currentSupabase = anonClient();
    expect(
      await linkCalendarItemsAction(crypto.randomUUID(), crypto.randomUUID()),
    ).toEqual({ error: "You must be signed in to link calendar items." });
    expect(
      await unlinkCalendarItemsAction(crypto.randomUUID(), crypto.randomUUID()),
    ).toEqual({ error: "You must be signed in to unlink calendar items." });
  });

  test("admin role (content_calendar manage) can link and unlink items", async () => {
    const pair = await createItemPair();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await linkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual({
      success: true,
    });

    const listed = await listRelatedCalendarItemCandidatesAction(pair.a.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.confirmed.map((row) => row.id)).toContain(pair.b.id);

    expect(await unlinkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual({
      success: true,
    });

    const afterUnlink = await listRelatedCalendarItemCandidatesAction(
      pair.a.id,
    );
    if (!("data" in afterUnlink)) throw new Error("expected data");
    expect(afterUnlink.data.confirmed).toHaveLength(0);

    await pair.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can link items", async () => {
    const pair = await createItemPair();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await linkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual({
      success: true,
    });

    // calendar_item_links cascades from either item's deletion.
    await pair.cleanup();
  });

  test("finance role (content_calendar view only) can list candidates but not link", async () => {
    const pair = await createItemPair();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const listed = await listRelatedCalendarItemCandidatesAction(pair.a.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.suggested.map((row) => row.id)).toContain(pair.b.id);

    expect(await linkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual(DENIED);
    expect(await unlinkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual(
      DENIED,
    );

    await pair.cleanup();
  });

  test("volunteer role (content_calendar view only) can list candidates but not link", async () => {
    const pair = await createItemPair();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(
      "data" in (await listRelatedCalendarItemCandidatesAction(pair.a.id)),
    ).toBe(true);
    expect(await linkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual(DENIED);

    await pair.cleanup();
  });

  test("board role (content_calendar view only) can list candidates but not link", async () => {
    const pair = await createItemPair();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      "data" in (await listRelatedCalendarItemCandidatesAction(pair.a.id)),
    ).toBe(true);
    expect(await linkCalendarItemsAction(pair.a.id, pair.b.id)).toEqual(DENIED);

    await pair.cleanup();
  });

  test("a no-role account can neither list candidates nor link", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(
      await listRelatedCalendarItemCandidatesAction(crypto.randomUUID()),
    ).toEqual(DENIED);
    expect(
      await linkCalendarItemsAction(crypto.randomUUID(), crypto.randomUUID()),
    ).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot link items", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await linkCalendarItemsAction(crypto.randomUUID(), crypto.randomUUID()),
    ).toEqual(DENIED);
  });
});
