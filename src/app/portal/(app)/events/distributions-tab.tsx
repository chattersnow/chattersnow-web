"use client";

import {
  listEventDistributionsAction,
  type EventDistributionRow,
} from "../home/distribution-actions";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function DistributionsTab({
  eventId,
}: {
  eventId: string;
  mode: "view" | "edit";
}) {
  const {
    data: distributions,
    loadError,
    refresh,
  } = useTabData<EventDistributionRow[]>(
    () => listEventDistributionsAction(eventId),
    [eventId],
  );

  useRegisterTabRefresh<TabValue>("distributions", refresh);

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {distributions === undefined ? (
        <TabLoadingSkeleton />
      ) : distributions.length === 0 ? (
        <EmptyState
          title="No gear distributed at this event yet"
          description="Record the first handout with + Record distribution above."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {distributions?.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="max-w-xs font-medium">
                  <span
                    className="block truncate"
                    title={movement.inventory_item?.description ?? undefined}
                  >
                    {movement.inventory_item?.description ?? "—"}
                  </span>
                  <span className="app-muted block text-xs">
                    {movement.inventory_item?.type}
                  </span>
                </TableCell>
                <TableCell>{movement.quantity}</TableCell>
                <TableCell className="app-muted">
                  {formatDateTime(movement.occurred_at)}
                </TableCell>
                <TableCell className="app-muted">
                  {movement.reason || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
