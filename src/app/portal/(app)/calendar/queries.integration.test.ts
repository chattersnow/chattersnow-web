// Integration test: exercises getCalendarItem (the detail-page query) against
// a real local Supabase stack, covering the row mapping (categories + the
// content-pieces join) and RLS visibility for a view-only role.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  createContentPiece,
  signInAs,
} from "../../../../../test/integration-setup";
import { getCalendarItem } from "./queries";

describe("getCalendarItem (integration)", () => {
  test("returns the mapped item with categories and its content pieces", async () => {
    const item = await createCalendarItem({
      categories: ["lgbtq_community", "own_events"],
    });
    // Two pieces on one item: the shape that only became legal in #1231, and
    // the one the detail page has to read back as a list.
    const first = await createContentPiece(item.id, {
      title: "Instagram carousel",
    });
    await createContentPiece(item.id, {
      title: "Email to past participants",
      contentStatus: "draft",
    });

    const { item: fetched, error } = await getCalendarItem(
      adminClient,
      item.id,
    );

    expect(error).toBe(false);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(item.id);
    expect(fetched!.item_type).toBe("community_observance");
    expect(fetched!.categories.sort()).toEqual([
      "lgbtq_community",
      "own_events",
    ]);
    expect(fetched!.program_ids).toEqual([]);
    expect(fetched!.content_pieces).toHaveLength(2);
    // Oldest first, the order the query asks for.
    expect(fetched!.content_pieces[0].id).toBe(first.id);
    expect(fetched!.content_pieces.map((piece) => piece.title)).toEqual([
      "Instagram carousel",
      "Email to past participants",
    ]);
    expect(fetched!.content_pieces[0].content_status).toBe("idea");

    await item.cleanup();
  });

  test("returns null (not an error) for an unknown id", async () => {
    const { item, error } = await getCalendarItem(
      adminClient,
      crypto.randomUUID(),
    );
    expect(error).toBe(false);
    expect(item).toBeNull();
  });

  test("a view-only role can read an item; anon cannot", async () => {
    const item = await createCalendarItem();

    const viewer = await signInAs(SEEDED_USERS.volunteer);
    const viewerResult = await getCalendarItem(viewer, item.id);
    expect(viewerResult.error).toBe(false);
    expect(viewerResult.item?.id).toBe(item.id);
    expect(viewerResult.item?.content_pieces).toEqual([]);

    // The API rejects anonymous reads of calendar_items outright (401),
    // which surfaces as a query error, never as a leaked row.
    const anonResult = await getCalendarItem(anonClient(), item.id);
    expect(anonResult.error).toBe(true);
    expect(anonResult.item).toBeNull();

    await item.cleanup();
  });
});
