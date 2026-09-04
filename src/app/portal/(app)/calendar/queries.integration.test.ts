// Integration test: exercises the calendar read queries -- getCalendarItem
// (the detail-page query) and listWorkQueueItems (the work-queue page's only
// data source) -- against a real local Supabase stack, covering the row
// mapping (categories + content opportunity join), the ordering and
// archived-item filtering PostgREST does server-side, and RLS visibility for
// a view-only role.
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
import { getCalendarItem, listWorkQueueItems } from "./queries";

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

describe("listWorkQueueItems (integration)", () => {
  test("returns non-archived items oldest first, with their content opportunity", async () => {
    // Inserted newest first so heap order and starts_at order disagree.
    const later = await createCalendarItem({
      startsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const earlier = await createCalendarItem({
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      categories: ["chatter_events"],
    });
    const opportunity = await createContentOpportunity(earlier.id);
    const archived = await createCalendarItem({
      calendarStatus: "archived",
      startsAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const items = await listWorkQueueItems(adminClient);
    const ids = items.map((item) => item.id);

    expect(ids).not.toContain(archived.id);
    expect(ids.indexOf(earlier.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));

    const fetched = items.find((item) => item.id === earlier.id)!;
    expect(fetched.categories).toEqual(["chatter_events"]);
    expect(fetched.content_opportunity?.id).toBe(opportunity.id);
    // The join is intentionally not an inner one: an item with no opportunity
    // yet still belongs in the queue.
    expect(
      items.find((item) => item.id === later.id)!.content_opportunity,
    ).toBeNull();

    await Promise.all([later.cleanup(), earlier.cleanup(), archived.cleanup()]);
  });

  test("a view-only role sees the queue; anon sees nothing rather than an error", async () => {
    const item = await createCalendarItem();

    const viewer = await signInAs(SEEDED_USERS.volunteer);
    const viewerItems = await listWorkQueueItems(viewer);
    expect(viewerItems.map((i) => i.id)).toContain(item.id);

    // The query swallows its error, so an anonymous read (rejected outright by
    // the API) has to come back empty -- never as a leaked row.
    expect(await listWorkQueueItems(anonClient())).toEqual([]);

    await item.cleanup();
  });
});
