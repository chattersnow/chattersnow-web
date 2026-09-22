"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import {
  CONDUCT_SEVERITIES,
  CONDUCT_STATUSES,
  conductLabel,
} from "@/lib/conduct";
import {
  CONDUCT_SEVERITY_TONES,
  CONDUCT_STATUS_TONES,
  type ConductListRow,
} from "./conduct-shared";

export type ConductQueueRow = ConductListRow & {
  subjectName: string;
  acknowledgementBadge: { label: string; tone: StatusTone } | null;
  acknowledgementOrder: number;
};

export function ConductReportsTable({ rows }: { rows: ConductQueueRow[] }) {
  const columns = useMemo<PortalDataTableColumn<ConductQueueRow>[]>(
    () => [
      {
        key: "reference",
        label: "Case",
        sortValue: (row) => row.reference,
        cellClassName: "font-medium whitespace-nowrap",
        render: (row) => (
          <Link
            href={`/portal/conduct/${row.id}`}
            className="underline underline-offset-2"
          >
            {row.reference}
          </Link>
        ),
      },
      {
        key: "received_on",
        label: "Received",
        hideBelow: "md",
        sortValue: (row) => row.received_on,
        cellClassName: "app-muted whitespace-nowrap",
        render: (row) => row.received_on,
      },
      {
        // The name is in the row because the queue is otherwise unreadable --
        // "which of these four is the one about the coach" -- and the whole
        // page is already behind a permission that most roles do not hold.
        key: "subject",
        label: "Subject",
        hideBelow: "lg",
        sortValue: (row) => row.subjectName,
        cellClassName: "max-w-xs truncate",
        render: (row) => row.subjectName,
      },
      {
        key: "severity",
        label: "Severity",
        hideBelow: "md",
        sortValue: (row) => row.severity,
        render: (row) => (
          <StatusBadge tone={CONDUCT_SEVERITY_TONES[row.severity]}>
            {conductLabel(CONDUCT_SEVERITIES, row.severity)}
          </StatusBadge>
        ),
      },
      {
        // Status and the acknowledgement clock in one cell on purpose: they
        // are read together, and the phone budget is three columns.
        key: "status",
        label: "Status",
        // Sorted by the clock rather than alphabetically by status, because
        // the only order anybody wants this queue in is "most overdue first".
        sortValue: (row) => row.acknowledgementOrder,
        render: (row) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={CONDUCT_STATUS_TONES[row.status]}>
              {conductLabel(CONDUCT_STATUSES, row.status)}
            </StatusBadge>
            {row.acknowledgementBadge && (
              <StatusBadge tone={row.acknowledgementBadge.tone}>
                {row.acknowledgementBadge.label}
              </StatusBadge>
            )}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      defaultSort={{ key: "received_on", dir: "desc" }}
      emptyMessage="No conduct reports to show."
    />
  );
}
