"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyAccessGrantAction } from "../../actions";
import { humanize } from "../../labels";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";
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
import { AccessGrantDetailsSheet } from "./access-grant-details-sheet";

const STATUS_BADGE_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  active: "secondary",
  revoked: "destructive",
  expired: "outline",
};

function VerifyButton({
  grantId,
  assetId,
}: {
  grantId: string;
  assetId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await verifyAccessGrantAction(grantId, assetId);
          router.refresh();
        })
      }
    >
      {isPending ? "Verifying..." : "Verify"}
    </Button>
  );
}

export function AccessGrantsTable({
  grants,
  assetId,
}: {
  grants: AccessGrantRow[];
  assetId: string;
}) {
  if (grants.length === 0) {
    return (
      <Card>
        <CardContent className="app-muted px-4 py-6 text-sm">
          No access grants recorded for this asset yet.
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
              <TableHead>Person</TableHead>
              <TableHead>Access level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead>Last verified</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell className="font-medium">
                  {grant.person?.name ?? "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {humanize(grant.access_level)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[grant.status] ?? "outline"}
                    className="capitalize"
                  >
                    {grant.status}
                  </Badge>
                </TableCell>
                <TableCell className="app-muted">{grant.granted_at}</TableCell>
                <TableCell className="app-muted">
                  {grant.last_verified || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {grant.status === "active" && (
                      <VerifyButton grantId={grant.id} assetId={assetId} />
                    )}
                    <AccessGrantDetailsSheet grant={grant} assetId={assetId} />
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
