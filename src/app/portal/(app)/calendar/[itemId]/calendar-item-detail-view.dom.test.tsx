import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import * as RelatedItemsActions from "../related-items-actions";
import type { CalendarItemRow } from "../calendar-shared";

mock.module("../related-items-actions", () => ({
  ...RelatedItemsActions,
  listRelatedCalendarItemCandidatesAction: mock(async () => ({
    data: { confirmed: [], suggested: [] },
  })),
}));

const { CalendarItemDetailView } = await import("./calendar-item-detail-view");

function makeItem(overrides: Partial<CalendarItemRow> = {}): CalendarItemRow {
  return {
    id: "item-1",
    title: "Trans Day of Visibility",
    item_type: "heritage_social_justice_moment",
    starts_at: "2026-03-31T10:00:00.000Z",
    ends_at: null,
    time_zone: "America/Denver",
    recurrence_rule: "Annual, March 31",
    summary: "Awareness moment.",
    priority_tier: 1,
    priority_rationale: "Core community moment.",
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
    categories: ["lgbtq_community"],
    program_ids: [],
    content_opportunity: null,
    ...overrides,
  };
}

function renderView(
  item: CalendarItemRow,
  { canManage = true }: { canManage?: boolean } = {},
) {
  return render(
    <CalendarItemDetailView
      item={item}
      owners={[]}
      programs={[]}
      activeTemplates={[]}
      defaultLeadTimeDays={21}
      programSuggestionRules={[]}
      canManage={canManage}
    />,
  );
}

describe("CalendarItemDetailView", () => {
  test("shows every section flat, without tabs", () => {
    renderView(makeItem());

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    for (const label of [
      "Schedule & details",
      "Planning & decision",
      "Sensitive topic",
      "Content brief",
      "Related items",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Trans Day of Visibility" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Annual, March 31")).toBeInTheDocument();
    expect(screen.getByText("Core community moment.")).toBeInTheDocument();
  });

  test("edits inline per card, with item actions in the header", () => {
    renderView(makeItem());

    for (const label of [
      "Edit schedule & details",
      "Edit planning & decision",
      "Edit sensitive topic",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete calendar item" }),
    ).toBeInTheDocument();
    // No structured recurrence on this item, so no generate action.
    expect(
      screen.queryByRole("button", { name: "Generate next year" }),
    ).not.toBeInTheDocument();
  });

  test("offers Restore instead of Archive for archived items", () => {
    renderView(makeItem({ calendar_status: "archived" }));

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
  });

  test("offers Generate next year for structured-recurrence items", () => {
    renderView(
      makeItem({
        series_key: "tdov",
        recurrence_start_month: 3,
        recurrence_start_day: 31,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Generate next year" }),
    ).toBeInTheDocument();
  });

  test("hides all mutation controls without manage access", () => {
    renderView(
      makeItem({ is_sensitive_topic: true, tone_guidance: "Be affirming." }),
      { canManage: false },
    );

    for (const label of [
      "Edit schedule & details",
      "Edit planning & decision",
      "Edit sensitive topic",
    ]) {
      expect(
        screen.queryByRole("button", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Duplicate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete calendar item" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record reviewer sign-off" }),
    ).not.toBeInTheDocument();
  });

  test("lets a manager record sensitive-topic sign-off from the page", () => {
    renderView(
      makeItem({ is_sensitive_topic: true, tone_guidance: "Be affirming." }),
    );

    expect(
      screen.getByRole("button", { name: "Record reviewer sign-off" }),
    ).toBeInTheDocument();
    // Shown in both the Sensitive topic card and the content brief's
    // tone-guidance callout.
    expect(screen.getAllByText("Be affirming.").length).toBeGreaterThan(0);
  });
});
