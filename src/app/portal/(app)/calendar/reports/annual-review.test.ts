import { describe, expect, test } from "bun:test";
import {
  computeAnnualReview,
  type AnnualReviewItemRow,
  type AnnualReviewOpportunityRow,
} from "./annual-review";

function item(
  overrides: Partial<AnnualReviewItemRow> = {},
): AnnualReviewItemRow {
  return {
    id: "item-1",
    priority_tier: 3,
    decision: null,
    visibility: "internal",
    calendar_status: "idea",
    ...overrides,
  };
}

function opportunity(
  overrides: Partial<AnnualReviewOpportunityRow> = {},
): AnnualReviewOpportunityRow {
  return {
    id: "opp-1",
    calendar_item_id: "item-1",
    content_status: "not_planned",
    chatter_connection: null,
    template_id: null,
    draft_due_at: null,
    review_due_at: null,
    publish_due_at: null,
    created_at: "2026-01-01T00:00:00Z",
    status_changed_at: null,
    ...overrides,
  };
}

describe("computeAnnualReview", () => {
  test("returns zeros/null for empty inputs", () => {
    const result = computeAnnualReview([], [], []);
    expect(result).toEqual({
      tier1Decided: 0,
      tier1Total: 0,
      plannedCompletedOnTime: 0,
      plannedWithPublishTarget: 0,
      overdueCount: 0,
      medianBriefToReviewDays: null,
      publicWithConnectionCount: 0,
      permissionsRecordedCount: 0,
    });
  });

  test("counts Tier 1 items with and without a decision", () => {
    const items = [
      item({ id: "a", priority_tier: 1, decision: "plan" }),
      item({ id: "b", priority_tier: 1, decision: null }),
      item({ id: "c", priority_tier: 2, decision: null }),
    ];
    const result = computeAnnualReview(items, [], []);
    expect(result.tier1Total).toBe(2);
    expect(result.tier1Decided).toBe(1);
  });

  test("counts a planned opportunity published on or before its due date", () => {
    const items = [item({ id: "a", decision: "plan" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        content_status: "published",
        publish_due_at: "2026-03-31T00:00:00Z",
        status_changed_at: "2026-03-30T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.plannedWithPublishTarget).toBe(1);
    expect(result.plannedCompletedOnTime).toBe(1);
  });

  test("does not count a planned opportunity published after its due date", () => {
    const items = [item({ id: "a", decision: "plan" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        content_status: "published",
        publish_due_at: "2026-03-31T00:00:00Z",
        status_changed_at: "2026-04-02T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.plannedWithPublishTarget).toBe(1);
    expect(result.plannedCompletedOnTime).toBe(0);
  });

  test("excludes opportunities whose item was skipped/deferred, not planned", () => {
    const items = [item({ id: "a", decision: "skip" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        content_status: "skipped",
        publish_due_at: "2026-03-31T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.plannedWithPublishTarget).toBe(0);
  });

  test("counts overdue opportunities via the shared overdueStage helper", () => {
    const items = [item({ id: "a" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        content_status: "draft",
        draft_due_at: "2020-01-01T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(
      items,
      opportunities,
      [],
      new Date("2026-01-01"),
    );
    expect(result.overdueCount).toBe(1);
  });

  test("computes the median brief-to-in_review time across qualifying opportunities", () => {
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        template_id: "t1",
        content_status: "in_review",
        created_at: "2026-01-01T00:00:00Z",
        status_changed_at: "2026-01-05T00:00:00Z",
      }),
      opportunity({
        calendar_item_id: "b",
        template_id: "t1",
        content_status: "in_review",
        created_at: "2026-01-01T00:00:00Z",
        status_changed_at: "2026-01-11T00:00:00Z",
      }),
      opportunity({
        calendar_item_id: "c",
        template_id: null,
        content_status: "in_review",
        created_at: "2026-01-01T00:00:00Z",
        status_changed_at: "2026-01-31T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.medianBriefToReviewDays).toBe(7);
  });

  test("excludes opportunities that have moved past in_review from the brief-time metric", () => {
    const items = [item({ id: "a" })];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        template_id: "t1",
        content_status: "published",
        created_at: "2026-01-01T00:00:00Z",
        status_changed_at: "2026-02-01T00:00:00Z",
      }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.medianBriefToReviewDays).toBeNull();
  });

  test("counts a live public item with a non-empty Chatter connection", () => {
    const items = [
      item({ id: "a", visibility: "public", calendar_status: "active" }),
      item({ id: "b", visibility: "internal", calendar_status: "active" }),
      item({ id: "c", visibility: "public", calendar_status: "idea" }),
      item({ id: "d", visibility: "public", calendar_status: "complete" }),
    ];
    const opportunities = [
      opportunity({
        calendar_item_id: "a",
        chatter_connection: "Ties to the winter gear drive",
      }),
      opportunity({
        calendar_item_id: "b",
        chatter_connection: "Also relevant",
      }),
      opportunity({
        calendar_item_id: "c",
        chatter_connection: "Not live yet",
      }),
      opportunity({ calendar_item_id: "d", chatter_connection: "" }),
    ];
    const result = computeAnnualReview(items, opportunities, []);
    expect(result.publicWithConnectionCount).toBe(1);
  });

  test("counts recorded permissions as-is, already scoped by the caller", () => {
    const result = computeAnnualReview(
      [],
      [],
      [
        { id: "p1", content_opportunity_id: "o1" },
        { id: "p2", content_opportunity_id: "o2" },
      ],
    );
    expect(result.permissionsRecordedCount).toBe(2);
  });
});
