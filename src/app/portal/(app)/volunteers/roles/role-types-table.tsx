"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  RoleTypeDetailsSheet,
  type RoleTypeRow,
} from "./role-type-details-sheet";

export function RoleTypesTable({
  roleTypes,
  canManage,
}: {
  roleTypes: RoleTypeRow[];
  canManage: boolean;
}) {
  const columns = useMemo<PortalDataTableColumn<RoleTypeRow>[]>(
    () => [
      {
        key: "name",
        label: "Role",
        sortValue: (roleType) => roleType.name,
        cellClassName: "font-medium",
        render: (roleType) => roleType.name,
      },
      {
        // Truncated free text, so there is nothing useful in its alphabetical
        // order.
        key: "description",
        label: "Description",
        cellClassName: "app-muted max-w-sm truncate",
        render: (roleType) => roleType.description || "—",
      },
      {
        key: "is_public",
        label: "Public",
        // The word the cell shows, so ascending groups the "No"s first
        // instead of ordering on a boolean a reader can't see.
        sortValue: (roleType) => (roleType.is_public ? "Yes" : "No"),
        cellClassName: "app-muted",
        render: (roleType) => (roleType.is_public ? "Yes" : "No"),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (roleType) => (
          <RoleTypeDetailsSheet roleType={roleType} canManage={canManage} />
        ),
      },
    ],
    [canManage],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={roleTypes}
      getRowKey={(roleType) => roleType.id}
      // Matches the query's own ordering.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No role types to show."
    />
  );
}
