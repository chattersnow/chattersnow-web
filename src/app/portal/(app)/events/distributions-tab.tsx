"use client";

import {
  listEventDistributionsAction,
  type EventDistributionRow,
} from "../home/distribution-actions";
import { RecordDistributionModal } from "../home/record-distribution-modal";
import { useTabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function DistributionsTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const {
    data: distributions,
    loadError,
    refresh,
  } = useTabData<EventDistributionRow[]>(
    () => listEventDistributionsAction(eventId),
    active,
    [eventId],
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {mode === "edit" && (
        <RecordDistributionModal
          eventId={eventId}
          triggerLabel="+ Record distribution"
          onSaved={refresh}
        />
      )}

      {distributions === undefined ? (
        <p className="app-muted text-sm">Loading distributions...</p>
      ) : distributions.length === 0 ? (
        <p className="app-muted text-sm">
          No gear distributed at this event yet.
        </p>
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
                  {dateFormatter.format(new Date(movement.occurred_at))}
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
