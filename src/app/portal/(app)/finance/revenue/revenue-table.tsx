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
import { EditRevenueModal } from "./edit-revenue-modal";
import { RevenueSourceBadge } from "./revenue-badges";
import {
  REVENUE_SOURCES,
  revenueSourceLabel,
  type EventOption,
  type RevenueRow,
  type RevenueSource,
} from "./revenue-shared";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const FILTER_ALL = "all";

export function RevenueTable({
  revenue,
  events,
  initialSourceFilter = null,
  action,
}: {
  revenue: RevenueRow[];
  events: EventOption[];
  initialSourceFilter?: RevenueSource | null;
  action?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<RevenueSource | null>(
    initialSourceFilter,
  );

  const visibleRevenue = useMemo(() => {
    const query = search.trim().toLowerCase();

    return revenue.filter((row) => {
      if (eventFilter === "none" && row.event_id) return false;
      if (eventFilter && eventFilter !== "none" && row.event_id !== eventFilter)
        return false;
      if (sourceFilter && row.source !== sourceFilter) return false;
      if (
        query &&
        !revenueSourceLabel(row.source).toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [revenue, search, eventFilter, sourceFilter]);

  const columns = useMemo<PortalDataTableColumn<RevenueRow>[]>(
    () => [
      {
        key: "source",
        label: "Source",
        // Sorts on the label the cell actually shows. On the raw enum,
        // "onsite_donations" ordered against "Registration fees".
        sortValue: (row) => revenueSourceLabel(row.source),
        render: (row) => <RevenueSourceBadge source={row.source} />,
      },
      {
        key: "received_date",
        label: "Date",
        sortValue: (row) => row.received_date,
        render: (row) => formatCalendarDate(row.received_date),
      },
      {
        key: "amount",
        label: "Amount",
        sortValue: (row) => Number(row.amount),
        render: (row) => formatCurrency(row.amount),
      },
      {
        key: "event",
        label: "Event",
        cellClassName: "app-muted",
        render: (row) => row.events?.name ?? "—",
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (row) => <EditRevenueModal revenue={row} events={events} />,
      },
    ],
    [events],
  );

  const activeFilterCount = [
    search.trim() !== "",
    eventFilter !== null,
    sourceFilter !== null,
  ].filter(Boolean).length;

  if (revenue.length === 0) {
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
              title="No revenue recorded yet"
              description={
                action
                  ? "Record the first one with New Revenue above."
                  : "Revenue appears here once someone records it."
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
              htmlFor="revenue-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="revenue-search"
              placeholder="Search source..."
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
                    if (value === FILTER_ALL) return "All revenue";
                    if (value === "none") return "No event";
                    return (
                      events.find((event) => event.id === value)?.name ??
                      "Event"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All revenue</SelectItem>
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
              Source
            </span>
            <Select
              value={sourceFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setSourceFilter(
                  value === FILTER_ALL ? null : (value as RevenueSource),
                )
              }
            >
              <SelectTrigger aria-label="Filter by source">
                <SelectValue placeholder="Source">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All sources"
                      : revenueSourceLabel(value as RevenueSource)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All sources</SelectItem>
                {REVENUE_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {revenueSourceLabel(source)}
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
        rows={visibleRevenue}
        getRowKey={(row) => row.id}
        defaultSort={{ key: "received_date", dir: "desc" }}
        emptyMessage="No revenue matches your filters."
      />
    </div>
  );
}
