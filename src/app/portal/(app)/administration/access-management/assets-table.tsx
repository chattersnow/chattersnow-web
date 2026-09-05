"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SENSITIVITY_LEVELS,
  isReviewDue,
} from "@/lib/portal/access-management/review-cadence";
import type { AssetListRow } from "@/lib/portal/access-management/types";
import { DeleteAssetButton } from "./delete-asset-button";
import { humanize } from "./labels";
import { EmptyState } from "@/components/portal/empty-state";

const SENSITIVITY_BADGE_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
};

export function AssetsTable({
  assets,
  activeGrantCounts,
}: {
  assets: AssetListRow[];
  activeGrantCounts: Record<string, number>;
}) {
  const columns = useMemo<PortalDataTableColumn<AssetListRow>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (asset) => asset.name,
        cellClassName: "max-w-xs truncate font-medium",
        render: (asset) => (
          <Link
            href={`/portal/administration/access-management/assets/${asset.id}`}
            className="hover:underline"
          >
            {asset.name}
          </Link>
        ),
      },
      {
        key: "service",
        label: "Service",
        sortValue: (asset) => asset.service?.name,
        hideBelow: "md",
        cellClassName: "app-muted",
        render: (asset) => asset.service?.name ?? "—",
      },
      {
        key: "category",
        label: "Category",
        // On the humanized label, which is what the cell shows.
        sortValue: (asset) => humanize(asset.category),
        hideBelow: "lg",
        cellClassName: "app-muted",
        render: (asset) => humanize(asset.category),
      },
      {
        key: "sensitivity",
        label: "Sensitivity",
        // By severity, not alphabetically: the point of sorting this column
        // is to bring critical assets together, and "critical, high, low,
        // medium" would do the opposite.
        sortValue: (asset) => SENSITIVITY_LEVELS.indexOf(asset.sensitivity),
        hideBelow: "lg",
        render: (asset) => (
          <Badge
            variant={SENSITIVITY_BADGE_VARIANT[asset.sensitivity] ?? "outline"}
            className="capitalize"
          >
            {asset.sensitivity}
          </Badge>
        ),
      },
      {
        key: "mfa_status",
        label: "MFA",
        sortValue: (asset) => asset.mfa_status,
        hideBelow: "lg",
        cellClassName: "app-muted capitalize",
        render: (asset) => asset.mfa_status,
      },
      {
        key: "status",
        label: "Status",
        sortValue: (asset) => asset.status,
        cellClassName: "app-muted capitalize",
        render: (asset) => asset.status,
      },
      {
        key: "permissions",
        label: "Permissions",
        // Numeric, so 9 grants sort below 10 rather than after them.
        sortValue: (asset) => activeGrantCounts[asset.id] ?? 0,
        hideBelow: "lg",
        render: (asset) => (
          <Badge variant="outline">{activeGrantCounts[asset.id] ?? 0}</Badge>
        ),
      },
      {
        key: "next_review",
        label: "Next review",
        // ISO dates, so string order is date order; assets with no review
        // scheduled fall to the end either way.
        sortValue: (asset) => asset.next_review,
        hideBelow: "md",
        render: (asset) =>
          asset.next_review ? (
            <span
              className={
                isReviewDue(asset.next_review)
                  ? "font-medium text-destructive"
                  : "app-muted"
              }
            >
              {asset.next_review}
            </span>
          ) : (
            <span className="app-muted">—</span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (asset) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              aria-label={`View ${asset.name}`}
              render={
                <Link
                  href={`/portal/administration/access-management/assets/${asset.id}`}
                />
              }
            >
              <Eye />
            </Button>
            <DeleteAssetButton
              assetId={asset.id}
              assetName={asset.name}
              activeGrantCount={activeGrantCounts[asset.id] ?? 0}
            />
          </div>
        ),
      },
    ],
    [activeGrantCounts],
  );

  // Distinct from the table's own empty row: no asset has been recorded yet,
  // which is a different sentence and points at New asset.
  if (assets.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="No assets found"
            description="Add the first one with New asset above to start tracking access."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <PortalDataTable
      columns={columns}
      rows={assets}
      getRowKey={(asset) => asset.id}
      // Matches the query's own ordering.
      defaultSort={{ key: "name", dir: "asc" }}
      emptyMessage="No assets to show."
      stickyFirstColumn
    />
  );
}
