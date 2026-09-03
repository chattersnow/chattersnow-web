import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { listDistributionsAction } from "../../home/distribution-actions";
import { RecordDistributionModal } from "../../home/record-distribution-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { formatDateTime, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export const metadata: Metadata = {
  title: "Distribution",
};

export default async function DistributionPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canRecord = hasAnyPermission(permissions, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);

  const result = await listDistributionsAction();

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Distribution
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        {canRecord ? (
          <RecordDistributionModal
            triggerLabel="Record distribution"
            showRecipientField
          />
        ) : (
          <div />
        )}
      </div>

      <div className="mt-6">
        {"error" in result ? (
          <Alert variant="destructive">
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardContent className="px-0">
              {result.data.length === 0 ? (
                <EmptyState
                  title="No distributions recorded yet"
                  description={
                    canRecord
                      ? "Record the first one with Record distribution above."
                      : "Distributions appear here once gear is handed out."
                  }
                />
              ) : (
                <Table stickyFirstColumn>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead hideBelow="sm">Date</TableHead>
                      <TableHead hideBelow="md">Event</TableHead>
                      <TableHead hideBelow="lg">Recipient</TableHead>
                      <TableHead hideBelow="lg">Reason</TableHead>
                      <TableHead className="w-0">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="max-w-xs font-medium">
                          <span
                            className="block truncate"
                            title={
                              movement.inventory_item?.description ?? undefined
                            }
                          >
                            {movement.inventory_item?.description ?? "—"}
                          </span>
                          <span className="app-muted block text-xs">
                            {movement.inventory_item?.type}
                          </span>
                        </TableCell>
                        <TableCell>{movement.quantity}</TableCell>
                        <TableCell hideBelow="sm" className="app-muted">
                          {formatDateTime(movement.occurred_at)}
                        </TableCell>
                        <TableCell
                          hideBelow="md"
                          className="max-w-xs truncate app-muted"
                          title={movement.event?.name ?? undefined}
                        >
                          {movement.event?.name ?? "—"}
                        </TableCell>
                        <TableCell
                          hideBelow="lg"
                          className="max-w-xs truncate app-muted"
                          title={movement.recipient?.name ?? undefined}
                        >
                          {personDisplayName(movement.recipient)}
                        </TableCell>
                        <TableCell hideBelow="lg" className="app-muted">
                          {movement.reason || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            nativeButton={false}
                            aria-label={`View distribution of ${
                              movement.inventory_item?.description ?? "item"
                            }`}
                            render={
                              <Link
                                href={`/portal/inventory/distribution/${movement.id}`}
                              />
                            }
                          >
                            <Eye />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
