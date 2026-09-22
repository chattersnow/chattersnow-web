"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCalendarDate } from "@/lib/format";
import { isExpired } from "@/lib/portal/person-screenings";

export type OutcomeRow = {
  id: string;
  cleared_on: string;
  expires_on: string | null;
  person: { id: string; name: string | null } | null;
  tier: { name: string } | null;
};

export function RecentOutcomesTable({
  outcomes,
  today,
}: {
  outcomes: OutcomeRow[];
  /** The tenant's own day, so an expiry is not judged in the viewer's zone. */
  today: string;
}) {
  const columns = useMemo<PortalDataTableColumn<OutcomeRow>[]>(
    () => [
      {
        key: "person",
        label: "Person",
        sortValue: (row) => row.person?.name ?? "",
        cellClassName: "font-medium",
        render: (row) =>
          row.person ? (
            <Link
              href={`/portal/people/${row.person.id}`}
              className="underline-offset-4 hover:underline"
            >
              {row.person.name ?? "—"}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "tier",
        label: "Level",
        sortValue: (row) => row.tier?.name ?? "",
        render: (row) => row.tier?.name ?? "—",
      },
      {
        key: "cleared_on",
        label: "Cleared",
        sortValue: (row) => row.cleared_on,
        cellClassName: "app-muted",
        render: (row) => formatCalendarDate(row.cleared_on),
      },
      {
        key: "expires_on",
        label: "Runs to",
        hideBelow: "md",
        // The ISO day, so ascending is chronological; a row with no end date
        // sorts last rather than first, which is where "never expires"
        // belongs in a list somebody is scanning for what lapses next.
        sortValue: (row) => row.expires_on ?? "9999-12-31",
        cellClassName: "app-muted",
        render: (row) =>
          row.expires_on === null ? (
            "—"
          ) : isExpired(row, today) ? (
            <Badge variant="destructive">
              Expired {formatCalendarDate(row.expires_on)}
            </Badge>
          ) : (
            formatCalendarDate(row.expires_on)
          ),
      },
    ],
    [today],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={outcomes}
      getRowKey={(row) => row.id}
      // Matches the query's own ordering.
      defaultSort={{ key: "cleared_on", dir: "desc" }}
      emptyMessage="No outcomes to show."
    />
  );
}
