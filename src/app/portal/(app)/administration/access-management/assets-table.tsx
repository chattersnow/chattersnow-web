import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

export function AssetsTable({ assets }: { assets: AssetListRow[] }) {
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
              <TableHead>Next review</TableHead>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
