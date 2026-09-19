"use client";

// The other half of the Community & Partnerships section (#1242): the
// relationships, beside the Calendar's dated items.
//
// The Calendar answers "what is happening"; this answers "what needs a push".
// A partnership whose next step is already behind the organization's today is
// the row the board is there to say out loud, so it is flagged in place rather
// than gathered into a list of its own -- the same call the Events section
// makes about an event that still owes its report.
import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { StatusBadge } from "@/components/portal/status-badge";
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
import { CONTEXT_SOURCE_HREFS } from "./meeting-context-catalog";
import { PartnershipStageBadge } from "../partnerships/partnership-badges";
import type { AgendaPartnershipsFeed as AgendaPartnershipsFeedData } from "./agenda-calendar-actions";

export function AgendaPartnershipsFeed({
  feed,
  loadError,
}: {
  /** `undefined` while the read is in flight. */
  feed: AgendaPartnershipsFeedData | undefined;
  loadError: string | null;
}) {
  if (loadError) return <p className="app-muted text-sm">{loadError}</p>;
  if (feed === undefined) return <Skeleton className="h-16 w-full" />;

  // A quiet line, not an `Alert`, for the same reason the calendar half gives:
  // the Discussion box below has to stay usable in the meeting.
  if (feed.unavailable) {
    return (
      <div>
        <p className="text-sm font-semibold">Open partnerships</p>
        <p className="app-muted mt-1 text-sm">
          Partnerships could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">Open partnerships</p>
      {feed.partnerships.length === 0 ? (
        <EmptyState className="py-4" title="No open partnerships" />
      ) : (
        <div className="mt-2">
          <Table stickyHeader="page" aria-label="Open partnerships">
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.partnerships.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-xs font-medium">
                    {/* The partnerships page rather than a row of its own:
                        there is no detail route, the table there opens each
                        one in a dialog. */}
                    <Link
                      href={CONTEXT_SOURCE_HREFS.partnerships}
                      className="text-[var(--purple-deep)] underline"
                    >
                      {row.organization}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PartnershipStageBadge stage={row.stage} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.next_step_date ? (
                      row.overdue ? (
                        <StatusBadge tone="warning">
                          Overdue {formatCalendarDate(row.next_step_date)}
                        </StatusBadge>
                      ) : (
                        formatCalendarDate(row.next_step_date)
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="app-muted text-xs">
                    {row.owner_name ?? "—"}
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
