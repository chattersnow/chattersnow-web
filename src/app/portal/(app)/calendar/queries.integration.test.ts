// Integration test: exercises getCalendarItem (the detail-page query) against
// a real local Supabase stack, covering the row mapping (categories +
// content opportunity join) and RLS visibility for a view-only role.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  createContentOpportunity,
  signInAs,
} from "../../../../../test/integration-setup";
import { getCalendarItem } from "./queries";

describe("getCalendarItem (integration)", () => {
  test("returns the mapped item with categories and content opportunity", async () => {
    const item = await createCalendarItem({
      categories: ["lgbtq_community", "chatter_events"],
    });
    const opportunity = await createContentOpportunity(item.id);

    const { item: fetched, error } = await getCalendarItem(
      adminClient,
      item.id,
    );

    expect(error).toBe(false);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(item.id);
    expect(fetched!.item_type).toBe("community_observance");
    expect(fetched!.categories.sort()).toEqual([
      "chatter_events",
      "lgbtq_community",
    ]);
    expect(fetched!.program_ids).toEqual([]);
    expect(fetched!.content_opportunity).not.toBeNull();
    expect(fetched!.content_opportunity!.id).toBe(opportunity.id);
    expect(fetched!.content_opportunity!.content_status).toBe("idea");

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

    // The API rejects anonymous reads of calendar_items outright (401),
    // which surfaces as a query error, never as a leaked row.
    const anonResult = await getCalendarItem(anonClient(), item.id);
    expect(anonResult.error).toBe(true);
    expect(anonResult.item).toBeNull();

    await item.cleanup();
  });
});
