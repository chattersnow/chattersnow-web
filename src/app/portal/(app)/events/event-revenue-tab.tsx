"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function EventRevenueTab({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
  mode: "view" | "edit";
}) {
  const [revenue, setRevenue] = useState<RevenueRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const eventOptions: EventOption[] = useMemo(
    () => [{ id: eventId, name: eventName }],
    [eventId, eventName],
  );

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refresh = useCallback(() => {
    listEventRevenueAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setRevenue(result.data);
      }
    });
  }, [eventId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRegisterTabRefresh<TabValue>("revenue", refresh);

  const columns = useMemo<PortalDataTableColumn<RevenueRow>[]>(
    () => [
      {
        key: "source",
        label: "Source",
        // Sorts on the label the cell actually shows. On the raw enum,
        // "onsite_donations" ordered against "Registration fees".
        sortValue: (row) => revenueSourceLabel(row.source),
        render: (row) => revenueSourceLabel(row.source),
      },
      {
        key: "received_date",
        label: "Date",
        sortValue: (row) => row.received_date,
        cellClassName: "app-muted",
        render: (row) => formatCalendarDate(row.received_date),
      },
      {
        key: "amount",
        label: "Amount",
        // Numeric, because amounts arrive from Postgres as strings and would
        // otherwise sort "100" before "9".
        sortValue: (row) => Number(row.amount),
        render: (row) => formatCurrency(row.amount),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (row) => (
          <EditRevenueModal
            revenue={row}
            events={eventOptions}
            lockEventSelection
            onSaved={refresh}
          />
        ),
      },
    ],
    [eventOptions, refresh],
  );

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
        <PortalDataTable
          columns={columns}
          rows={revenue}
          getRowKey={(row) => row.id}
          // listEventRevenueAction returns newest first.
          defaultSort={{ key: "received_date", dir: "desc" }}
          emptyMessage="No revenue to show."
          // The tab is already inside its own card on the phase grid.
          shell="bare"
        />
      )}
    </div>
  );
}
