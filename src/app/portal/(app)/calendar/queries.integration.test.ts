// Integration test: exercises the calendar read queries against a real local
// Supabase stack -- getCalendarItem (the detail-page query) and
// listWorkQueueItems (the work-queue page's only query, #456), covering the
// row mapping (categories + content opportunity join), the archived filter
// and starts_at ordering PostgREST applies, and RLS visibility for a
// view-only role.
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
  test("returns non-archived items in starts_at order with their content opportunity", async () => {
    // Inserted latest-first so heap order and starts_at order disagree; far
    // enough out that no seeded or concurrently-created item lands between
    // them.
    const later = await createCalendarItem({
      startsAt: new Date("2099-06-02T00:00:00.000Z").toISOString(),
      categories: ["chatter_events"],
    });
    const earlier = await createCalendarItem({
      startsAt: new Date("2099-06-01T00:00:00.000Z").toISOString(),
    });
    const opportunity = await createContentOpportunity(earlier.id);

    const { items, truncated, error } = await listWorkQueueItems(adminClient);
    expect(error).toBe(false);
    // The query pages past PostgREST's max_rows now (#755), so these year-2099
    // rows only fall off the end once the calendar passes WORK_QUEUE_MAX_ITEMS
    // -- at which point `truncated` says so rather than the list silently
    // ending. Still asserted present before the ordering compare, since two
    // indexOf misses would satisfy `-1 < -1` on their own.
    expect(truncated).toBe(false);
    const ids = items.map((item) => item.id);
    expect(ids).toContain(earlier.id);
    expect(ids).toContain(later.id);
    expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));

    const fetchedEarlier = items.find((item) => item.id === earlier.id)!;
    expect(fetchedEarlier.content_opportunity?.id).toBe(opportunity.id);
    expect(fetchedEarlier.content_opportunity?.content_status).toBe("idea");

    // Not inner-joined: an item with no opportunity yet still belongs in the
    // queue, since the Tier-1-undecided warning applies at the item level.
    const fetchedLater = items.find((item) => item.id === later.id)!;
    expect(fetchedLater.content_opportunity).toBeNull();
    expect(fetchedLater.categories).toEqual(["chatter_events"]);

    await earlier.cleanup();
    await later.cleanup();
  });

  test("excludes archived items", async () => {
    const active = await createCalendarItem({ calendarStatus: "active" });
    const archived = await createCalendarItem({ calendarStatus: "archived" });

    const { items } = await listWorkQueueItems(adminClient);
    const ids = items.map((item) => item.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(archived.id);

    await active.cleanup();
    await archived.cleanup();
  });

  test("a view-only role sees the queue; anon gets nothing", async () => {
    const item = await createCalendarItem();

    const viewer = await signInAs(SEEDED_USERS.volunteer);
    const viewerQueue = await listWorkQueueItems(viewer);
    expect(viewerQueue.items.map((i) => i.id)).toContain(item.id);

    // An anonymous request is rejected outright (401), not filtered down to
    // zero rows, so it comes back on the error channel -- which is the point
    // of having one: no rows because the read failed is not the same thing as
    // no rows because there is no work, and the page says so.
    expect(await listWorkQueueItems(anonClient())).toEqual({
      items: [],
      truncated: false,
      error: true,
    });

    await item.cleanup();
  });
});
