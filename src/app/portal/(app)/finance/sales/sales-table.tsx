"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import {
  formatCurrency,
  formatDateTime,
  personDisplayName,
} from "@/lib/format";
import { SaleStatusBadge } from "./sale-badges";
import { SaleDetailsSheet } from "./sale-details-sheet";
import {
  PAYMENT_METHODS,
  paymentMethodLabel,
  saleItemCount,
  type EventOption,
  type PaymentMethod,
  type SaleRow,
  type SaleStatus,
} from "./sales-shared";

const FILTER_ALL = "all";

const STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Completed",
  voided: "Voided",
};

export function SalesTable({
  sales,
  events,
  canManage,
  action,
}: {
  sales: SaleRow[];
  events: EventOption[];
  canManage: boolean;
  action?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SaleStatus | null>(null);
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | null>(null);

  const visibleSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sales.filter((sale) => {
      if (eventFilter === "none" && sale.event_id) return false;
      if (
        eventFilter &&
        eventFilter !== "none" &&
        sale.event_id !== eventFilter
      )
        return false;
      if (statusFilter && sale.status !== statusFilter) return false;
      if (methodFilter && sale.payment_method !== methodFilter) return false;
      if (query) {
        // What somebody looking for one sale actually remembers: what was in
        // it, who bought it, or what they typed in the note.
        const haystack = [
          personDisplayName(sale.purchaser, ""),
          sale.notes ?? "",
          ...(sale.sale_line_items ?? []).map((line) => line.description),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [sales, search, eventFilter, statusFilter, methodFilter]);

  const columns = useMemo<PortalDataTableColumn<SaleRow>[]>(
    () => [
      {
        key: "sold_at",
        label: "Date",
        sortValue: (sale) => sale.sold_at,
        render: (sale) => formatDateTime(sale.sold_at),
      },
      {
        key: "items",
        label: "Items",
        sortValue: (sale) => saleItemCount(sale),
        render: (sale) => saleItemCount(sale),
      },
      {
        key: "purchaser",
        label: "Purchaser",
        cellClassName: "app-muted",
        sortValue: (sale) => personDisplayName(sale.purchaser, ""),
        render: (sale) => personDisplayName(sale.purchaser),
      },
      {
        key: "payment_method",
        label: "Payment",
        hideBelow: "sm",
        sortValue: (sale) =>
          paymentMethodLabel(sale.payment_method as PaymentMethod),
        render: (sale) =>
          paymentMethodLabel(sale.payment_method as PaymentMethod),
      },
      {
        key: "total",
        label: "Total",
        // Numeric: totals arrive from Postgres as strings and would otherwise
        // sort "100" before "9".
        sortValue: (sale) => Number(sale.total),
        render: (sale) => formatCurrency(sale.total),
      },
      {
        key: "event",
        label: "Event",
        hideBelow: "lg",
        cellClassName: "app-muted",
        render: (sale) => sale.events?.name ?? "—",
      },
      {
        key: "status",
        label: "Status",
        sortValue: (sale) => STATUS_LABELS[sale.status],
        render: (sale) => <SaleStatusBadge status={sale.status} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (sale) => (
          <SaleDetailsSheet sale={sale} events={events} canManage={canManage} />
        ),
      },
    ],
    [events, canManage],
  );

  const activeFilterCount = [
    search.trim() !== "",
    eventFilter !== null,
    statusFilter !== null,
    methodFilter !== null,
  ].filter(Boolean).length;

  if (sales.length === 0) {
    return (
      <div className="space-y-4">
        {action && (
          <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
            {action}
          </div>
        )}
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No sales recorded yet"
              description={
                canManage
                  ? "Open the register to ring up the first one."
                  : "Sales appear here once someone rings one up at the register."
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sales-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="sales-search"
              placeholder="Search item, purchaser or note..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Event
            </span>
            <Select
              value={eventFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setEventFilter(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger aria-label="Filter by event">
                <SelectValue placeholder="Event">
                  {(value: string) => {
                    if (value === FILTER_ALL) return "All sales";
                    if (value === "none") return "No event";
                    return (
                      events.find((event) => event.id === value)?.name ??
                      "Event"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All sales</SelectItem>
                <SelectItem value="none">No event</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={statusFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setStatusFilter(
                  value === FILTER_ALL ? null : (value as SaleStatus),
                )
              }
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All statuses"
                      : STATUS_LABELS[value as SaleStatus]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Payment
            </span>
            <Select
              value={methodFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setMethodFilter(
                  value === FILTER_ALL ? null : (value as PaymentMethod),
                )
              }
            >
              <SelectTrigger aria-label="Filter by payment method">
                <SelectValue placeholder="Payment">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All payments"
                      : paymentMethodLabel(value as PaymentMethod)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All payments</SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {paymentMethodLabel(method)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersSheet>

        {action}
      </div>

      <PortalDataTable
        columns={columns}
        rows={visibleSales}
        getRowKey={(sale) => sale.id}
        defaultSort={{ key: "sold_at", dir: "desc" }}
        emptyMessage="No sales match your filters."
      />
    </div>
  );
}
