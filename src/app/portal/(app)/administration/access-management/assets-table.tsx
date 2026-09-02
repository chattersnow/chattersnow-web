import Link from "next/link";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isReviewDue } from "@/lib/portal/access-management/review-cadence";
import type { AssetListRow } from "@/lib/portal/access-management/types";
import { DeleteAssetButton } from "./delete-asset-button";
import { humanize } from "./labels";

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
  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">
          No assets found. Add the first one to start tracking access.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>MFA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Next review</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell className="max-w-xs truncate font-medium">
                  <Link
                    href={`/portal/administration/access-management/assets/${asset.id}`}
                    className="hover:underline"
                  >
                    {asset.name}
                  </Link>
                </TableCell>
                <TableCell className="app-muted">
                  {asset.service?.name ?? "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {humanize(asset.category)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      SENSITIVITY_BADGE_VARIANT[asset.sensitivity] ?? "outline"
                    }
                    className="capitalize"
                  >
                    {asset.sensitivity}
                  </Badge>
                </TableCell>
                <TableCell className="app-muted capitalize">
                  {asset.mfa_status}
                </TableCell>
                <TableCell className="app-muted capitalize">
                  {asset.status}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {activeGrantCounts[asset.id] ?? 0}
                  </Badge>
                </TableCell>
                <TableCell>
                  {asset.next_review ? (
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
                  )}
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
