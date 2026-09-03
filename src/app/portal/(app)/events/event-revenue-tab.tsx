"use client";

import { useEffect, useState } from "react";
import { listEventRevenueAction } from "../finance/revenue/actions";
import { EditRevenueModal } from "../finance/revenue/edit-revenue-modal";
import {
  revenueSourceLabel,
  type EventOption,
  type RevenueRow,
} from "../finance/revenue/revenue-shared";
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
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function EventRevenueTab({
  eventId,
  eventName,
  active,
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

  useRegisterTabRefresh<TabValue>("revenue", refresh);

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {revenue === null ? (
        <TabLoadingSkeleton />
      ) : revenue.length === 0 ? (
        <EmptyState
          title="No revenue recorded for this event yet"
          description="Add the first entry with New Revenue above."
        />
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
                  {formatCalendarDate(row.received_date)}
                </TableCell>
                <TableCell>{formatCurrency(row.amount)}</TableCell>
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
