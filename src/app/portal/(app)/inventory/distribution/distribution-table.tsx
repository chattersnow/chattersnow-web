"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import type { DistributionRow } from "../../home/distribution-actions";
import { formatDateTime, personDisplayName } from "@/lib/format";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";

// Outside the component: nothing here closes over a prop, so there is one
// array for the module rather than a fresh one per render.
const COLUMNS: PortalDataTableColumn<DistributionRow>[] = [
  {
    key: "item",
    label: "Item",
    // The description is what the cell leads with; the category underneath it
    // is a caption, so it stays out of the sort.
    sortValue: (movement) => movement.inventory_item?.description,
    cellClassName: "max-w-xs font-medium",
    render: (movement) => (
      <>
        <span
          className="block truncate"
          title={movement.inventory_item?.description ?? undefined}
        >
          {movement.inventory_item?.description ?? "—"}
        </span>
        <span className="app-muted block text-xs">
          {movement.inventory_item
            ? categoryLabelFor(flattenCategory(movement.inventory_item))
            : null}
        </span>
      </>
    ),
  },
  {
    key: "quantity",
    label: "Qty",
    sortValue: (movement) => movement.quantity,
    render: (movement) => movement.quantity,
  },
  {
    key: "occurred_at",
    label: "Date",
    sortValue: (movement) => movement.occurred_at,
    hideBelow: "sm",
    cellClassName: "app-muted",
    render: (movement) => formatDateTime(movement.occurred_at),
  },
  {
    key: "event",
    label: "Event",
    sortValue: (movement) => movement.event?.name,
    hideBelow: "md",
    cellClassName: "max-w-xs app-muted",
    render: (movement) => (
      <span
        className="block truncate"
        title={movement.event?.name ?? undefined}
      >
        {movement.event?.name ?? "—"}
      </span>
    ),
  },
  {
    key: "recipient",
    label: "Recipient",
    // Sorts on what the cell shows, which is the placeholder for a
    // distribution recorded without a named recipient.
    sortValue: (movement) => personDisplayName(movement.recipient),
    hideBelow: "lg",
    cellClassName: "max-w-xs app-muted",
    render: (movement) => (
      <span
        className="block truncate"
        title={movement.recipient?.name ?? undefined}
      >
        {personDisplayName(movement.recipient)}
      </span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    // Empty strings are as absent as nulls here, so both sort to the end
    // rather than leading with a column of em dashes.
    sortValue: (movement) => movement.reason || null,
    hideBelow: "lg",
    cellClassName: "app-muted",
    render: (movement) => movement.reason || "—",
  },
  {
    key: "actions",
    label: "Actions",
    srOnlyLabel: true,
    headClassName: "w-0",
    render: (movement) => (
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        aria-label={`View distribution of ${
          movement.inventory_item?.description ?? "item"
        }`}
        render={<Link href={`/portal/inventory/distribution/${movement.id}`} />}
      >
        <Eye />
      </Button>
    ),
  },
];

export function DistributionTable({
  movements,
}: {
  movements: DistributionRow[];
}) {
  return (
    <PortalDataTable
      columns={COLUMNS}
      rows={movements}
      getRowKey={(movement) => movement.id}
      // The list arrives newest first from listDistributionsAction, which is
      // also what its 100-row limit is applied against.
      defaultSort={{ key: "occurred_at", dir: "desc" }}
      emptyMessage="No distributions to show."
      stickyFirstColumn
    />
  );
}
