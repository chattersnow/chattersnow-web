"use client";

// The Events section's rows, in the module-feed slot #1240 left for them.
//
// Read live on render, the same stance the "Next 30 days" block takes: a
// rescheduled event is right the next time anybody opens the agenda, and
// nothing here is copied into the agenda row. What the board *says* about these
// events is the Discussion box underneath, and that is the only part that saves.
//
// Ordered by date and not sortable. This is a period being reviewed in the
// order it happened, so a click that reorders it is a click that loses the
// reader's place for no gain.
import Link from "next/link";
import { ViewerTime } from "@/components/viewer-time";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusBadge as StatusPill } from "@/components/portal/status-badge";
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
import { StatusBadge, ReportStatusBadge } from "../../events/event-badges";
import { eventReportOutstanding } from "./agenda-feed-text";
import type {
  AgendaEvent,
  AgendaEventsFeed as AgendaEventsFeedData,
  AgendaEventsGroup,
} from "./agenda-events-actions";

const UNAVAILABLE_MESSAGES = {
  forbidden: "Events are not shown — your role does not include Events.",
  error: "Events could not be loaded.",
} as const;

function EventsGroup({
  title,
  label,
  group,
  emptyTitle,
  /** Past events are the ones that can still owe a report. */
  past,
}: {
  title: string;
  /** Names the table for a screen reader, which cannot see the heading above it. */
  label: string;
  group: AgendaEventsGroup;
  emptyTitle: string;
  past?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="app-muted text-xs">
        {formatCalendarDate(group.fromDate)} –{" "}
        {formatCalendarDate(group.toDate)}
      </p>
      {group.events.length === 0 ? (
        <EmptyState className="py-4" title={emptyTitle} />
      ) : (
        <div className="mt-2">
          <Table stickyHeader="page" aria-label={label}>
            <TableHeader>
              <TableRow>
                {/* Three columns at 390px (#1090). The event's own status is
                    the one to drop: this block is read for what is coming and
                    what still owes a report, and the status is on the event's
                    page, which the name links to. */}
                <TableHead>Event</TableHead>
                <TableHead>Date</TableHead>
                <TableHead hideBelow="sm">Status</TableHead>
                <TableHead>Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.events.map((event) => (
                <EventRow key={event.id} event={event} past={past} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EventRow({ event, past }: { event: AgendaEvent; past?: boolean }) {
  // The one row a board is there to act on: the event is behind it, it happened,
  // and the report still isn't in. Marked in place rather than gathered into a
  // list of its own, so it stays beside the date it is late against. The rule
  // lives with the export's copy of these rows (#1244), so the printed agenda
  // flags exactly what this table flags.
  const reportOutstanding = eventReportOutstanding(event, past);

  return (
    <TableRow>
      <TableCell className="max-w-xs font-medium">
        <Link
          href={`/portal/events/${event.id}`}
          className="text-[var(--purple-deep)] underline"
        >
          {event.name}
        </Link>
        {event.event_lead_name && (
          <span className="app-muted block text-xs font-normal">
            {event.event_lead_name}
          </span>
        )}
      </TableCell>
      <TableCell>
        <ViewerTime iso={event.starts_at} fallbackZone={event.timezone} />
      </TableCell>
      <TableCell hideBelow="sm">
        <StatusBadge status={event.status} />
      </TableCell>
      <TableCell>
        {reportOutstanding ? (
          <StatusPill tone="warning">Outstanding</StatusPill>
        ) : (
          <ReportStatusBadge status={event.report_status} />
        )}
      </TableCell>
    </TableRow>
  );
}

export function AgendaEventsFeed({
  feed,
  loadError,
}: {
  /** `undefined` while the read is in flight. */
  feed: AgendaEventsFeedData | undefined;
  loadError: string | null;
}) {
  if (loadError) return <p className="app-muted text-sm">{loadError}</p>;
  if (feed === undefined) return <Skeleton className="h-16 w-full" />;

  // A quiet line, not an `Alert`: the events module being off or unreachable
  // must not make the section look broken in the middle of a meeting. The
  // Discussion box below it still works, which is the part that has to.
  if (feed.unavailable) {
    return (
      <p className="app-muted text-sm">
        {UNAVAILABLE_MESSAGES[feed.unavailable]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {feed.since ? (
        <EventsGroup
          title="Since the last meeting"
          label="Events since the last meeting"
          group={feed.since}
          emptyTitle="No events since the last meeting"
          past
        />
      ) : (
        <div>
          <p className="text-sm font-semibold">Since the last meeting</p>
          <p className="app-muted mt-1 text-sm">
            This is the first recorded meeting, so there is no period to review.
          </p>
        </div>
      )}
      <EventsGroup
        title="Coming up"
        label="Events coming up before the next meeting"
        group={feed.upcoming}
        emptyTitle="No events scheduled before the next meeting"
      />
    </div>
  );
}
