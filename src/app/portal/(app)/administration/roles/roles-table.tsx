"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { formatRoleLabel } from "@/lib/format";
import { RoleDetailsDialog, type RoleRow } from "./role-details-dialog";
import { EmptyState } from "@/components/portal/empty-state";

export function RolesTable({ roles }: { roles: RoleRow[] }) {
  const columns = useMemo<PortalDataTableColumn<RoleRow>[]>(
    () => [
      {
        key: "name",
        label: "Role",
        // On the label rather than the stored name: "board_member" reads as
        // "Board member" in the cell, and that is the order a reader expects
        // to get back.
        sortValue: (role) => formatRoleLabel(role.name),
        cellClassName: "max-w-xs font-medium",
        render: (role) => (
          <span className="block truncate" title={formatRoleLabel(role.name)}>
            {formatRoleLabel(role.name)}
          </span>
        ),
      },
      {
        key: "description",
        // Truncated free text: there is nothing a reader would look for in
        // its alphabetical order, so it stays unsorted.
        label: "Description",
        cellClassName: "app-muted max-w-sm truncate",
        render: (role) => role.description || "—",
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (role) => <RoleDetailsDialog role={role} />,
      },
    ],
    [],
  );

  // Distinct from the table's own empty row: nothing has been created yet,
  // which is a different sentence and carries the pointer at New role.
  if (roles.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No roles found"
            description="Add the first one with New role above."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <PortalDataTable
      columns={columns}
      rows={roles}
      getRowKey={(role) => role.id}
      // The query orders by name, so the arrow starts on the column the list
      // already arrives sorted by.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No roles to show."
    />
  );
}
