"use client";

// A calendar-sourced section's rows, in the module-feed slot #1240 left for
// them (#1242). Shared with Marketing & Social (#1243): which items are in it
// is the section's source, which this component never reads.
//
// Read live on render, the same stance the "Next 30 days" block takes: a
// rescheduled item is right the next time anybody opens the agenda, and
// nothing here is copied into the agenda row. What the board *says* about
// these items is the Discussion box underneath, and that is the only part that
// saves.
//
// Ordered by date and not sortable. This is a period being planned in the
// order it will happen, so a click that reorders it is a click that loses the
// reader's place for no gain.
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import { calendarItemHref } from "../../calendar/calendar-entries";
import { ITEM_TYPES, labelFor } from "../../calendar/calendar-shared";
import type {
  AgendaCalendarFeed as AgendaCalendarFeedData,
  AgendaCalendarItem,
} from "./agenda-calendar-actions";

const UNAVAILABLE_MESSAGES = {
  forbidden:
    "Calendar items are not shown — your role does not include the Content Calendar.",
  error: "Calendar items could not be loaded.",
} as const;

/**
 * The day an item falls on, in the item's **own** zone -- the same reading
 * `agenda-view.tsx` groups the calendar by and the "Next 30 days" block
 * labels its rows with. Read in the viewer's zone instead, an item dated at
 * midnight lands on the previous day for anyone west of it.
 */
function itemDay(item: AgendaCalendarItem): string {
  return formatDateInZone(new Date(item.starts_at), item.time_zone || "UTC");
}

export function AgendaCalendarFeed({
  feed,
  loadError,
  title,
  label,
  emptyTitle,
}: {
  /** `undefined` while the read is in flight. */
  feed: AgendaCalendarFeedData | undefined;
  loadError: string | null;
  title: string;
  /** Names the table for a screen reader, which cannot see the heading above it. */
  label: string;
  emptyTitle: string;
}) {
  if (loadError) return <p className="app-muted text-sm">{loadError}</p>;
  if (feed === undefined) return <Skeleton className="h-16 w-full" />;

  // A quiet line, not an `Alert`: the calendar being off or unreachable must
  // not make the section look broken in the middle of a meeting. The
  // Discussion box below it still works, which is the part that has to.
  if (feed.unavailable) {
    return (
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="app-muted mt-1 text-sm">
          {UNAVAILABLE_MESSAGES[feed.unavailable]}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="app-muted text-xs">
        {formatCalendarDate(feed.window.fromDate)} –{" "}
        {formatCalendarDate(feed.window.toDate)}
      </p>
      {feed.items.length === 0 ? (
        <EmptyState className="py-4" title={emptyTitle} />
      ) : (
        <div className="mt-2">
          <Table stickyHeader="page" aria-label={label}>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Categories</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.items.map((item) => (
                // Keyed on the id and the occurrence: a series projected into
                // the window and the same row read on its own date are two
                // rows whenever a window spans two of its anniversaries.
                <TableRow key={`${item.id}:${item.starts_at}`}>
                  <TableCell className="whitespace-nowrap">
                    {formatCalendarDate(itemDay(item))}
                  </TableCell>
                  <TableCell className="max-w-xs font-medium">
                    <Link
                      href={calendarItemHref(item.id)}
                      className="text-[var(--purple-deep)] underline"
                    >
                      {item.title}
                    </Link>
                    {item.owner_name && (
                      <span className="app-muted block text-xs font-normal">
                        {item.owner_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{labelFor(ITEM_TYPES, item.item_type)}</TableCell>
                  <TableCell className="app-muted text-xs">
                    {/* The tenant's own words, not the seeded keys -- and a
                        key it has since deactivated still labels the items
                        already tagged with it, through `labelFor`'s fallback. */}
                    {item.categories.length === 0
                      ? "—"
                      : item.categories
                          .map((key) => labelFor(feed.categoryOptions, key))
                          .join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
