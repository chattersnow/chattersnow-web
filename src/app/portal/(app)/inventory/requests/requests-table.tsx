"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  formatCurrency,
  formatDateTime,
  personDisplayName,
} from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/gear-requests";
import { GearRequestStatusBadge } from "./request-status-badge";

export type GearRequestListRow = {
  id: string;
  status: string;
  delivery_method: string;
  quoted_amount: number | string | null;
  created_at: string;
  requester: {
    id: string;
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  items: { inventory_item: { description: string | null } | null }[];
};

function itemsSummary(row: GearRequestListRow): string {
  const descriptions = row.items
    .map((item) => item.inventory_item?.description?.trim() ?? "")
    .filter(Boolean);
  if (descriptions.length === 0) return "—";
  if (descriptions.length === 1) return descriptions[0];
  return `${descriptions[0]} +${descriptions.length - 1} more`;
}

// Outside the component: nothing here closes over a prop, so there is one
// array for the module rather than a fresh one per render.
const COLUMNS: PortalDataTableColumn<GearRequestListRow>[] = [
  {
    key: "created_at",
    label: "Requested",
    sortValue: (row) => row.created_at,
    cellClassName: "app-muted whitespace-nowrap",
    render: (row) => formatDateTime(row.created_at),
  },
  {
    key: "requester",
    label: "Requester",
    sortValue: (row) => personDisplayName(row.requester, ""),
    cellClassName: "max-w-xs font-medium",
    render: (row) => (
      <>
        <span className="block truncate">
          {personDisplayName(row.requester, "Anonymized")}
        </span>
        {row.requester?.email ? (
          <span className="app-muted block truncate text-xs">
            {row.requester.email}
          </span>
        ) : null}
      </>
    ),
  },
  {
    key: "items",
    label: "Items",
    sortValue: (row) => row.items.length,
    hideBelow: "md",
    cellClassName: "max-w-xs",
    render: (row) => (
      <>
        <span className="block truncate" title={itemsSummary(row)}>
          {itemsSummary(row)}
        </span>
        <span className="app-muted block text-xs">
          {row.items.length === 1 ? "1 item" : `${row.items.length} items`}
        </span>
      </>
    ),
  },
  {
    key: "delivery",
    label: "Delivery",
    sortValue: (row) => row.delivery_method,
    hideBelow: "sm",
    render: (row) => deliveryMethodLabel(row.delivery_method),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (row) => row.status,
    render: (row) => <GearRequestStatusBadge status={row.status} />,
  },
  {
    key: "quote",
    label: "Postage",
    sortValue: (row) =>
      row.quoted_amount === null ? null : Number(row.quoted_amount),
    hideBelow: "lg",
    cellClassName: "app-muted",
    render: (row) =>
      row.delivery_method === "shipping"
        ? formatCurrency(row.quoted_amount, "Not quoted")
        : "—",
  },
  {
    key: "actions",
    label: "Actions",
    srOnlyLabel: true,
    cellClassName: "text-right",
    render: (row) => (
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href={`/portal/inventory/requests/${row.id}`} />}
      >
        <Eye className="size-4" />
        View
      </Button>
    ),
  },
];

export function GearRequestsTable({ rows }: { rows: GearRequestListRow[] }) {
  return (
    <PortalDataTable
      columns={COLUMNS}
      rows={rows}
      getRowKey={(row) => row.id}
      defaultSort={{ key: "created_at", dir: "desc" }}
      emptyMessage="No requests match these filters."
    />
  );
}
