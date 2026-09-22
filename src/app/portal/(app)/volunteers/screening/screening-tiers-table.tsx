"use client";

import { useMemo } from "react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  ScreeningTierDetailsSheet,
  type ScreeningTierRow,
} from "./screening-tier-details-sheet";

export function ScreeningTiersTable({
  tiers,
  canManage,
}: {
  tiers: ScreeningTierRow[];
  canManage: boolean;
}) {
  const columns = useMemo<PortalDataTableColumn<ScreeningTierRow>[]>(
    () => [
      {
        key: "name",
        label: "Level",
        sortValue: (tier) => tier.name,
        cellClassName: "font-medium",
        render: (tier) => tier.name,
      },
      {
        // Truncated free text, so there is nothing useful in its alphabetical
        // order.
        key: "description",
        label: "What it covers",
        hideBelow: "md",
        cellClassName: "app-muted max-w-sm truncate",
        render: (tier) => tier.description || "—",
      },
      {
        key: "is_active",
        label: "In use",
        // The word the cell shows, so ascending groups the "No"s first
        // instead of ordering on a boolean a reader can't see.
        sortValue: (tier) => (tier.is_active ? "Yes" : "No"),
        cellClassName: "app-muted",
        render: (tier) => (tier.is_active ? "Yes" : "No"),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right",
        render: (tier) => (
          <ScreeningTierDetailsSheet tier={tier} canManage={canManage} />
        ),
      },
    ],
    [canManage],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={tiers}
      getRowKey={(tier) => tier.id}
      // Matches the query's own ordering.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No screening levels to show."
    />
  );
}
