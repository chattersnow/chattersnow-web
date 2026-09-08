// Coverage for the events-on-the-portal-calendar projection (#530): which
// filters an event row can survive, how the merged list orders itself, and
// where each kind of row links.
import { describe, expect, test } from "bun:test";
import {
  calendarItemEntry,
  eventEntry,
  filtersExcludeEvents,
  sortCalendarEntries,
  type CalendarEntry,
  type CalendarEventRow,
  type CalendarFilters,
} from "./calendar-entries";
import type { CalendarItemRow } from "./calendar-shared";

const NO_FILTERS: CalendarFilters = {
  type: "all",
  category: "all",
  priority: "all",
  program: "all",
  owner: "all",
  visibility: "all",
  status: "all",
  decision: "all",
};

function item(overrides: Partial<CalendarItemRow> = {}): CalendarItemRow {
  return {
    id: "item-1",
    title: "Pride month planning",
    item_type: "community_observance",
    starts_at: "2026-06-01T00:00:00.000Z",
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
    categories: [],
    program_ids: [],
    content_opportunity: null,
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "event-1",
    title: "Season kickoff day",
    starts_at: "2026-06-02T00:00:00.000Z",
    ends_at: null,
    time_zone: "America/Denver",
    summary: null,
    location: "Loveland",
    status: "published",
    visibility: "public",
    program_ids: [],
    ...overrides,
  };
}

describe("entry projection", () => {
  test("an event links to the Events module, not a calendar item detail page", () => {
    const entry = eventEntry(event());
    expect(entry.href).toBe("/portal/events/event-1");
  });

  test("a calendar item still links to its own detail page", () => {
    expect(calendarItemEntry(item()).href).toBe("/portal/calendar/item-1");
  });

  test("entry ids stay distinct across the two sources", () => {
    // A calendar item and an event are both uuid-keyed in their own table and
    // could collide as React keys once merged into one list.
    const shared = "11111111-1111-1111-1111-111111111111";
    expect(calendarItemEntry(item({ id: shared })).id).not.toBe(
      eventEntry(event({ id: shared })).id,
    );
  });
});

describe("filtersExcludeEvents", () => {
  test("keeps events when nothing is filtered", () => {
    expect(filtersExcludeEvents(NO_FILTERS)).toBe(false);
  });

  test("keeps events for filters an event can answer", () => {
    expect(filtersExcludeEvents({ ...NO_FILTERS, type: "own_event" })).toBe(
      false,
    );
    expect(
      filtersExcludeEvents({ ...NO_FILTERS, category: "own_events" }),
    ).toBe(false);
    expect(filtersExcludeEvents({ ...NO_FILTERS, visibility: "public" })).toBe(
      false,
    );
    expect(filtersExcludeEvents({ ...NO_FILTERS, program: "program-1" })).toBe(
      false,
    );
  });

  test("drops events for a type or category they are not tagged with", () => {
    expect(
      filtersExcludeEvents({ ...NO_FILTERS, type: "content_campaign" }),
    ).toBe(true);
    expect(
      filtersExcludeEvents({ ...NO_FILTERS, category: "lgbtq_community" }),
    ).toBe(true);
  });

  test("drops events for content-calendar-only fields", () => {
    for (const filters of [
      { priority: "1" },
      { owner: "person-1" },
      { decision: "plan" },
      { status: "idea" },
      { visibility: "internal" },
    ]) {
      expect(filtersExcludeEvents({ ...NO_FILTERS, ...filters })).toBe(true);
    }
  });
});

describe("sortCalendarEntries", () => {
  const entries: CalendarEntry[] = [
    eventEntry(
      event({ id: "b", title: "Beta", starts_at: "2026-01-02T00:00:00.000Z" }),
    ),
    calendarItemEntry(
      item({ id: "a", title: "Alpha", starts_at: "2026-01-03T00:00:00.000Z" }),
    ),
    calendarItemEntry(
      item({ id: "c", title: "Gamma", starts_at: "2026-01-01T00:00:00.000Z" }),
    ),
  ];

  test("interleaves both sources by start date", () => {
    expect(
      sortCalendarEntries(entries, "starts_at", "asc").map((e) => e.title),
    ).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  test("reverses on desc", () => {
    expect(
      sortCalendarEntries(entries, "starts_at", "desc").map((e) => e.title),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  test("sorts titles case-insensitively", () => {
    const mixed = [
      calendarItemEntry(item({ id: "1", title: "zebra" })),
      calendarItemEntry(item({ id: "2", title: "Apple" })),
    ];
    expect(
      sortCalendarEntries(mixed, "title", "asc").map((e) => e.title),
    ).toEqual(["Apple", "zebra"]);
  });

  test("breaks ties on id so the order is stable", () => {
    const tied = [
      calendarItemEntry(item({ id: "z", title: "Same" })),
      calendarItemEntry(item({ id: "a", title: "Same" })),
    ];
    expect(sortCalendarEntries(tied, "title", "asc").map((e) => e.id)).toEqual([
      "a",
      "z",
    ]);
  });

  test("status sorts an event by its own lifecycle value", () => {
    const byStatus = [
      calendarItemEntry(item({ id: "1", calendar_status: "idea" })),
      eventEntry(event({ id: "2", status: "draft" })),
    ];
    expect(
      sortCalendarEntries(byStatus, "calendar_status", "asc").map(
        (e) => e.kind,
      ),
    ).toEqual(["event", "calendar_item"]);
  });

  test("does not mutate the input", () => {
    const original = [...entries];
    sortCalendarEntries(entries, "title", "desc");
    expect(entries).toEqual(original);
  });
});
