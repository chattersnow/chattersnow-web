"use client";

import { useMemo } from "react";
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
import { isResolvedStatus } from "@/lib/queue-claims";
import type { ClaimStaffMember } from "@/lib/portal/queue-claim-context";
import {
  ClaimRowActions,
  ClaimedByCell,
  type Claimant,
} from "@/components/portal/queue-claims";
import { GearRequestStatusBadge } from "./request-status-badge";
import { GearRequestAsIsBadge } from "./as-is-badge";
import type { AsIsRequestStatus } from "@/lib/gear-request-as-is-requests";

export type GearRequestListRow = {
  id: string;
  status: string;
  delivery_method: string;
  quoted_amount: number | string | null;
  created_at: string;
  as_is_acknowledged_at: string | null;
  as_is_method: string | null;
  /** The emailed link asking for the acknowledgement (#1518), if sent. */
  as_is_request: AsIsRequestStatus | null;
  requester: {
    id: string;
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  /** Who is working the request (#1668). */
  claimant: Claimant;
  items: { inventory_item: { description: string | null } | null }[];
};

type ClaimProps = {
  canManage: boolean;
  myPersonId: string | null;
  staff: ClaimStaffMember[];
};

function itemsSummary(row: GearRequestListRow): string {
  const descriptions = row.items
    .map((item) => item.inventory_item?.description?.trim() ?? "")
    .filter(Boolean);
  if (descriptions.length === 0) return "—";
  if (descriptions.length === 1) return descriptions[0];
  return `${descriptions[0]} +${descriptions.length - 1} more`;
}

// Built from the claim props, which the row actions close over; memoized
// below so a re-render with the same props keeps the same array.
function buildColumns({
  canManage,
  myPersonId,
  staff,
}: ClaimProps): PortalDataTableColumn<GearRequestListRow>[] {
  return [
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
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <GearRequestStatusBadge status={row.status} />
          <GearRequestAsIsBadge request={row} className="font-normal" />
        </span>
      ),
    },
    {
      key: "claimed_by",
      label: "Claimed by",
      sortValue: (row) =>
        row.claimant ? personDisplayName(row.claimant, "") : null,
      hideBelow: "sm",
      render: (row) => <ClaimedByCell claimant={row.claimant} />,
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
        <span className="inline-flex items-center justify-end gap-1">
          {/* Both of the queue's claim permissions are inventory:manage today;
            set_queue_item_claim() checks them separately. */}
          <ClaimRowActions
            queue="gear_requests"
            itemId={row.id}
            itemLabel={`Request from ${personDisplayName(row.requester, "Anonymized")}`}
            claimant={row.claimant}
            myPersonId={myPersonId}
            canClaim={canManage}
            canAssign={canManage}
            resolved={isResolvedStatus("gear_requests", row.status)}
            staff={staff}
          />
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/portal/inventory/requests/${row.id}`} />}
          >
            <Eye className="size-4" />
            View
          </Button>
        </span>
      ),
    },
  ];
}

export function GearRequestsTable({
  rows,
  canManage,
  myPersonId,
  staff,
}: { rows: GearRequestListRow[] } & ClaimProps) {
  const columns = useMemo(
    () => buildColumns({ canManage, myPersonId, staff }),
    [canManage, myPersonId, staff],
  );
  return (
    <PortalDataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      defaultSort={{ key: "created_at", dir: "desc" }}
      emptyMessage="No requests match these filters."
    />
  );
}
