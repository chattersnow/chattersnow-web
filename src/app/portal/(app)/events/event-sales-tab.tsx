"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listEventSalesAction } from "../finance/sales/actions";
import { SaleDetailsSheet } from "../finance/sales/sale-details-sheet";
import { SaleStatusBadge } from "../finance/sales/sale-badges";
import {
  paymentMethodLabel,
  saleItemCount,
  type EventOption,
  type PaymentMethod,
  type SaleRow,
} from "../finance/sales/sales-shared";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function EventSalesTab({
  eventId,
  eventName,
  mode,
}: {
  eventId: string;
  eventName: string;
  /**
   * `edit` when the reader holds `events:manage` -- what every plain card on
   * this page gets in place of a permission map (see PlainTabCard in
   * event-detail-view.tsx). Someone who holds `sales:manage` but not
   * `events:manage` edits and voids from the ledger instead, and the Server
   * Actions are the real gate either way.
   */
  mode: "view" | "edit";
}) {
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const eventOptions: EventOption[] = useMemo(
    () => [{ id: eventId, name: eventName }],
    [eventId, eventName],
  );

  const refresh = useCallback(() => {
    listEventSalesAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setSales(result.data);
      }
    });
  }, [eventId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRegisterTabRefresh<TabValue>("sales", refresh);

  const columns = useMemo<PortalDataTableColumn<SaleRow>[]>(
    () => [
      {
        key: "sold_at",
        label: "Date",
        sortValue: (sale) => sale.sold_at,
        cellClassName: "app-muted",
        render: (sale) => formatDateTime(sale.sold_at),
      },
      {
        key: "items",
        label: "Items",
        sortValue: (sale) => saleItemCount(sale),
        render: (sale) => saleItemCount(sale),
      },
      {
        key: "payment_method",
        label: "Payment",
        sortValue: (sale) =>
          paymentMethodLabel(sale.payment_method as PaymentMethod),
        render: (sale) =>
          paymentMethodLabel(sale.payment_method as PaymentMethod),
      },
      {
        key: "total",
        label: "Total",
        // Numeric, because totals arrive from Postgres as strings and would
        // otherwise sort "100" before "9".
        sortValue: (sale) => Number(sale.total),
        render: (sale) => formatCurrency(sale.total),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (sale) => sale.status,
        render: (sale) => <SaleStatusBadge status={sale.status} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (sale) => (
          <SaleDetailsSheet
            sale={sale}
            events={eventOptions}
            canManage={mode === "edit"}
            // This card is the event's own, so moving a sale off the event
            // from inside it would make the row disappear as it saved.
            lockEventSelection
            onSaved={refresh}
          />
        ),
      },
    ],
    [eventOptions, mode, refresh],
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {sales === null ? (
        <TabLoadingSkeleton />
      ) : sales.length === 0 ? (
        <EmptyState
          title="No sales recorded for this event yet"
          description="Open the register above to ring one up."
        />
      ) : (
        <PortalDataTable
          columns={columns}
          rows={sales}
          getRowKey={(sale) => sale.id}
          // listEventSalesAction returns newest first.
          defaultSort={{ key: "sold_at", dir: "desc" }}
          emptyMessage="No sales to show."
          // The tab is already inside its own card on the phase grid.
          shell="bare"
        />
      )}
    </div>
  );
}
