"use client";

import { useEffect, useState } from "react";
import { listEventRevenueAction } from "../finance/revenue/actions";
import { EditRevenueModal } from "../finance/revenue/edit-revenue-modal";
import { NewRevenueDialog } from "../finance/revenue/new-revenue-dialog";
import {
  formatAmount,
  formatRevenueDate,
  revenueSourceLabel,
  type EventOption,
  type RevenueRow,
} from "../finance/revenue/revenue-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function EventRevenueTab({
  eventId,
  eventName,
  active,
  mode,
}: {
  eventId: string;
  eventName: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const [revenue, setRevenue] = useState<RevenueRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const eventOptions: EventOption[] = [{ id: eventId, name: eventName }];

  function refresh() {
    listEventRevenueAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setRevenue(result.data);
      }
    });
  }

  useEffect(() => {
    if (!active) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {mode === "edit" && (
        <NewRevenueDialog
          events={eventOptions}
          defaultEventId={eventId}
          lockEventSelection
          triggerLabel="Add revenue"
          onSaved={refresh}
        />
      )}

      {revenue === null ? (
        <p className="app-muted text-sm">Loading revenue...</p>
      ) : revenue.length === 0 ? (
        <p className="app-muted text-sm">
          No revenue recorded for this event yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenue.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{revenueSourceLabel(row.source)}</TableCell>
                <TableCell className="app-muted">
                  {formatRevenueDate(row.received_date)}
                </TableCell>
                <TableCell>{formatAmount(row.amount)}</TableCell>
                <TableCell>
                  <EditRevenueModal
                    revenue={row}
                    events={eventOptions}
                    lockEventSelection
                    onSaved={refresh}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
