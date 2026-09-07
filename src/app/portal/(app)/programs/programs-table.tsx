"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { ProgramDetailsDialog } from "./program-details-dialog";
import { ProgramStatusBadge, type ProgramRow } from "./program-badges";

export function ProgramsTable({
  programs,
  canManage,
}: {
  programs: ProgramRow[];
  canManage: boolean;
}) {
  // Rebuilt only when the permission behind the row action changes, which in
  // practice is never within a session.
  const columns = useMemo<PortalDataTableColumn<ProgramRow>[]>(
    () => [
      {
        key: "name",
        label: "Program",
        sortValue: (program) => program.name,
        cellClassName: "font-medium",
        render: (program) => program.name,
      },
      {
        key: "description",
        // Truncated free text: there is nothing a reader would look for in its
        // alphabetical order, so it stays unsorted.
        label: "Description",
        cellClassName: "app-muted max-w-sm truncate",
        render: (program) => program.description || "—",
      },
      {
        key: "status",
        label: "Status",
        sortValue: (program) => program.status,
        render: (program) => <ProgramStatusBadge status={program.status} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (program) => (
          <ProgramDetailsDialog program={program} canManage={canManage} />
        ),
      },
    ],
    [canManage],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={programs}
      getRowKey={(program) => program.id}
      // The query orders by name, so the arrow starts on the column the list
      // is already sorted by.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No programs to show."
    />
  );
}
