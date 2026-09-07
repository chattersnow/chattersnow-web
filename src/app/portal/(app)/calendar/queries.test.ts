// Unit coverage for listWorkQueueItems' paging (#755). The work queue used to
// select every non-archived calendar item with no `.range()`, which PostgREST
// silently cuts off at max_rows (1000, supabase/config.toml) -- ascending
// starts_at, so the items that disappeared were the furthest-out ones, with no
// error and no indicator. Driven by a stub client rather than the real stack
// because the interesting cases start at a thousand rows.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WORK_QUEUE_MAX_ITEMS, listWorkQueueItems } from "./queries";

type RequestedRange = { from: number; to: number };

function row(index: number) {
  return {
    id: `item-${index}`,
    title: `Item ${index}`,
    item_type: "community_observance",
    starts_at: "2099-01-01T00:00:00.000Z",
    ends_at: null,
    time_zone: "America/Denver",
    recurrence_rule: null,
    summary: null,
    priority_tier: 3,
    priority_rationale: null,
    calendar_status: "active",
    visibility: "internal",
    owner_id: null,
    decision: null,
    decision_note: null,
    source: null,
    region: null,
    exceptions: [],
    is_sensitive_topic: false,
    tone_guidance: null,
    sensitive_review_by: null,
    sensitive_review_at: null,
    series_key: null,
    recurrence_start_month: null,
    recurrence_start_day: null,
    recurrence_end_month: null,
    recurrence_end_day: null,
    recurrence_end_is_month_end: false,
    calendar_item_categories: null,
    calendar_item_programs: null,
    content_opportunities: null,
  };
}

/**
 * A client holding `total` rows that answers a `.range()` the way PostgREST
 * does: the requested slice, and fewer rows than asked for once the table runs
 * out.
 */
function clientWith(total: number, ranges: RequestedRange[]): SupabaseClient {
  const builder = {
    select: () => builder,
    neq: () => builder,
    order: () => builder,
    range: async (from: number, to: number) => {
      ranges.push({ from, to });
      const rows = [];
      for (let index = from; index <= to && index < total; index += 1) {
        rows.push(row(index));
      }
      return { data: rows, error: null };
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

function clientFailing(): SupabaseClient {
  const builder = {
    select: () => builder,
    neq: () => builder,
    order: () => builder,
    range: async () => ({
      data: null,
      error: { code: "57014", message: "canceling statement due to timeout" },
    }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("listWorkQueueItems", () => {
  test("returns every row when the calendar fits in one page", async () => {
    const ranges: RequestedRange[] = [];
    const result = await listWorkQueueItems(clientWith(67, ranges));

    expect(result.items).toHaveLength(67);
    expect(result.truncated).toBe(false);
    expect(result.error).toBe(false);
    // A short page means the table is exhausted, so it must not ask again.
    expect(ranges).toEqual([{ from: 0, to: 999 }]);
  });

  // The regression this exists for: at 1,200 rows the old query returned 1,000
  // of them and said nothing about the other 200.
  test("keeps paging past PostgREST's max_rows", async () => {
    const ranges: RequestedRange[] = [];
    const result = await listWorkQueueItems(clientWith(1200, ranges));

    expect(result.items).toHaveLength(1200);
    expect(result.truncated).toBe(false);
    expect(result.items[1199]!.id).toBe("item-1199");
    expect(ranges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });

  test("stops at the cap and reports the list as truncated", async () => {
    const ranges: RequestedRange[] = [];
    const result = await listWorkQueueItems(
      clientWith(WORK_QUEUE_MAX_ITEMS + 500, ranges),
    );

    expect(result.items).toHaveLength(WORK_QUEUE_MAX_ITEMS);
    expect(result.truncated).toBe(true);
    // The last request reaches exactly one row past the cap: enough to know
    // there is more, without fetching a page of rows nothing will render.
    expect(ranges.at(-1)).toEqual({
      from: WORK_QUEUE_MAX_ITEMS,
      to: WORK_QUEUE_MAX_ITEMS,
    });
  });

  test("a calendar of exactly the cap is not reported as truncated", async () => {
    const ranges: RequestedRange[] = [];
    const result = await listWorkQueueItems(
      clientWith(WORK_QUEUE_MAX_ITEMS, ranges),
    );

    expect(result.items).toHaveLength(WORK_QUEUE_MAX_ITEMS);
    expect(result.truncated).toBe(false);
  });

  test("surfaces a failed query instead of returning it as an empty queue", async () => {
    const result = await listWorkQueueItems(clientFailing());

    expect(result.error).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
