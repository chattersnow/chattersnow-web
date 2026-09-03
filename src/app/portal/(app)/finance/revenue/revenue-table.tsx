"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SortHeaderButton } from "@/components/portal/sort-header-link";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type SortKey = "received_date" | "source" | "amount";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "source", label: "Source" },
  { key: "received_date", label: "Date" },
  { key: "amount", label: "Amount" },
];

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
  const [sortKey, setSortKey] = useState<SortKey>("received_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleRevenue = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = revenue.filter((row) => {
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

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") {
        return (Number(a.amount) - Number(b.amount)) * direction;
      }
      return a[sortKey].localeCompare(b[sortKey]) * direction;
    });
  }, [revenue, search, eventFilter, sourceFilter, sortKey, sortDirection]);

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
            <p className="app-muted px-4 py-6 text-sm">
              No revenue recorded yet.
            </p>
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

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                {SORT_COLUMNS.map((column) => (
                  <TableHead
                    key={column.key}
                    sortDirection={
                      sortKey === column.key ? sortDirection : null
                    }
                  >
                    <SortHeaderButton
                      label={column.label}
                      dir={sortKey === column.key ? sortDirection : null}
                      onSort={() => handleSort(column.key)}
                    />
                  </TableHead>
                ))}
                <TableHead>Event</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRevenue.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={SORT_COLUMNS.length + 2}
                    className="app-muted text-center"
                  >
                    No revenue matches your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRevenue.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <RevenueSourceBadge source={row.source} />
                    </TableCell>
                    <TableCell>
                      {formatCalendarDate(row.received_date)}
                    </TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="app-muted">
                      {row.events?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <EditRevenueModal revenue={row} events={events} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
