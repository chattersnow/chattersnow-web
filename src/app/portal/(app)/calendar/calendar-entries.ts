import type { CalendarItemRow } from "./calendar-shared";

/**
 * A portal event as the calendar draws it (#530).
 *
 * The Calendar module is the content & community editorial calendar, backed by
 * `calendar_items`; Events is a separate operational module backed by
 * `public.events`. Nothing links the two, so an event never appeared on the
 * calendar staff plan against. This projects events onto the calendar the same
 * read-only way `public_calendar_items` does for the public Community Calendar
 * (#359) -- no schema change, no merged tables, and every row links back to the
 * Events module for anything that changes it.
 */
export type CalendarEventRow = {
  id: string;
  /** `events.name`. */
  title: string;
  starts_at: string;
  ends_at: string | null;
  /** `events.timezone`. */
  time_zone: string;
  /** `events.description`. */
  summary: string | null;
  location: string | null;
  /** `events.status` -- draft/published/completed/cancelled, its own vocabulary, not `calendar_status`. */
  status: string;
  /** `events.visibility` -- public/private. */
  visibility: string;
  program_ids: string[];
};

/** What every calendar view needs from a row whatever it came from. */
type CalendarEntryBase = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
  summary: string | null;
  /** Where this row is managed: the calendar item's detail page, or the event's. */
  href: string;
};

/**
 * One row on the calendar. `kind` is what the views branch on: calendar items
 * carry the editorial workflow (priority tier, decision, sensitive review),
 * events carry none of it and are read-only markers here.
 */
export type CalendarEntry =
  | (CalendarEntryBase & { kind: "calendar_item"; item: CalendarItemRow })
  | (CalendarEntryBase & { kind: "event"; event: CalendarEventRow });

export function calendarItemEntry(item: CalendarItemRow): CalendarEntry {
  return {
    kind: "calendar_item",
    id: item.id,
    title: item.title,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    time_zone: item.time_zone,
    summary: item.summary,
    href: `/portal/calendar/${item.id}`,
    item,
  };
}

export function eventEntry(event: CalendarEventRow): CalendarEntry {
  return {
    kind: "event",
    id: `event:${event.id}`,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    time_zone: event.time_zone,
    summary: event.summary,
    href: `/portal/events/${event.id}`,
    event,
  };
}

/** The item_type an event is tagged with, matching `public_calendar_items` (#359). */
export const EVENT_ITEM_TYPE = "own_event";

/** The category an event is tagged with, matching `public_calendar_items` (#359). */
export const EVENT_CATEGORY = "own_events";

/** The URL filters the calendar page resolves, as they reach the events fetch. */
export type CalendarFilters = {
  type: string;
  category: string;
  priority: string;
  program: string;
  owner: string;
  visibility: string;
  status: string;
  decision: string;
};

/**
 * Whether events can survive the active filters at all.
 *
 * Half the calendar's filters are editorial concepts an event has no value
 * for -- priority tier, owner, decision, and `calendar_status`, whose
 * vocabulary (idea/active/complete) doesn't overlap the event lifecycle
 * (draft/published/completed/cancelled). Rather than invent a mapping, a row
 * that can't answer the question is left out, so "priority: Tier 1" means the
 * same thing it always did. Type, category, visibility and program do have an
 * event equivalent and are honoured below.
 */
export function filtersExcludeEvents(filters: CalendarFilters): boolean {
  if (filters.priority !== "all") return true;
  if (filters.owner !== "all") return true;
  if (filters.decision !== "all") return true;
  if (filters.status !== "all") return true;
  if (filters.type !== "all" && filters.type !== EVENT_ITEM_TYPE) return true;
  if (filters.category !== "all" && filters.category !== EVENT_CATEGORY)
    return true;
  // `public` is the one value both vocabularies share; `internal` and
  // `unlisted_draft` have no event counterpart.
  if (filters.visibility !== "all" && filters.visibility !== "public")
    return true;
  return false;
}

type CalendarSortColumn = "title" | "starts_at" | "calendar_status";

/**
 * Events sort by their own lifecycle status. There is no honest way to rank
 * "published" against "idea", so the column just orders the text it has.
 */
function statusValue(entry: CalendarEntry): string {
  return entry.kind === "event"
    ? entry.event.status
    : entry.item.calendar_status;
}

const COMPARATORS: Record<
  CalendarSortColumn,
  (a: CalendarEntry, b: CalendarEntry) => number
> = {
  title: (a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  // Compared as instants, not as text: the two sources are formatted by the
  // same PostgREST today, but a lexicographic tie-break on a timestamp is one
  // fractional-second difference away from ordering rows wrongly.
  starts_at: (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  calendar_status: (a, b) => statusValue(a).localeCompare(statusValue(b)),
};

/**
 * Orders the merged list. Calendar items arrive sorted by PostgREST and events
 * arrive separately, so the merge has to be re-sorted here rather than relying
 * on either query's order. Ties break on `id` so a re-render can't shuffle two
 * rows that share a value.
 */
export function sortCalendarEntries(
  entries: CalendarEntry[],
  sort: CalendarSortColumn,
  dir: "asc" | "desc",
): CalendarEntry[] {
  const compare = COMPARATORS[sort];
  const sign = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const compared = compare(a, b);
    if (compared !== 0) return compared * sign;
    return a.id.localeCompare(b.id);
  });
}
