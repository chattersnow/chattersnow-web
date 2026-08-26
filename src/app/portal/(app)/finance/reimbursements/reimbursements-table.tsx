"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { EditReimbursementModal } from "./edit-reimbursement-modal";
import { ReimbursementStatusBadge } from "./reimbursement-badges";
import { NewReimbursementDialog } from "./new-reimbursement-dialog";
import {
  formatAmount,
  formatReimbursementDate,
  type EventOption,
  type ReimbursementApprovalContext,
  type ReimbursementRow,
  type ReimbursementStatus,
} from "./reimbursements-shared";
import type { PersonListItem } from "../../people/actions";

type SortKey = "created_at" | "description" | "amount";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "created_at", label: "Submitted" },
  { key: "amount", label: "Amount" },
];

const FILTER_ALL = "all";

const STATUS_OPTIONS: ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

export function ReimbursementsTable({
  reimbursements,
  people,
  events,
  approvalContext,
  initialStatusFilter = null,
}: {
  reimbursements: ReimbursementRow[];
  people: PersonListItem[];
  events: EventOption[];
  approvalContext: ReimbursementApprovalContext;
  initialStatusFilter?: ReimbursementStatus | null;
}) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | null>(
    initialStatusFilter,
  );
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleReimbursements = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = reimbursements.filter((reimbursement) => {
      if (eventFilter === "none" && reimbursement.event_id) return false;
      if (
        eventFilter &&
        eventFilter !== "none" &&
        reimbursement.event_id !== eventFilter
      )
        return false;
      if (statusFilter && reimbursement.status !== statusFilter) return false;
      if (
        query &&
        !reimbursement.description.toLowerCase().includes(query) &&
        !(reimbursement.people?.name ?? "").toLowerCase().includes(query)
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
  }, [
    reimbursements,
    search,
    eventFilter,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  if (reimbursements.length === 0) {
    return (
      <div className="space-y-4">
        <NewReimbursementDialog people={people} events={events} />
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No reimbursements recorded yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <NewReimbursementDialog people={people} events={events} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reimbursements-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="reimbursements-search"
              placeholder="Search description or requester..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full sm:w-64"
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
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Event">
                  {(value: string) => {
                    if (value === FILTER_ALL) return "All reimbursements";
                    if (value === "none") return "No event";
                    return (
                      events.find((event) => event.id === value)?.name ??
                      "Event"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All reimbursements</SelectItem>
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
                  value === FILTER_ALL ? null : (value as ReimbursementStatus),
                )
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === FILTER_ALL ? "All statuses" : value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    className="capitalize"
                  >
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                {SORT_COLUMNS.map((column) => (
                  <TableHead key={column.key}>
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.label}
                      {sortKey === column.key ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead>Requester</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleReimbursements.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={SORT_COLUMNS.length + 4}
                    className="app-muted text-center"
                  >
                    No reimbursements match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleReimbursements.map((reimbursement) => (
                  <TableRow key={reimbursement.id}>
                    <TableCell className="whitespace-normal">
                      {reimbursement.description}
                    </TableCell>
                    <TableCell>
                      {formatReimbursementDate(reimbursement.created_at)}
                    </TableCell>
                    <TableCell>
                      {formatAmount(
                        reimbursement.amount,
                        reimbursement.currency,
                      )}
                    </TableCell>
                    <TableCell className="app-muted">
                      {reimbursement.people?.name ?? "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {reimbursement.events?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ReimbursementStatusBadge status={reimbursement.status} />
                    </TableCell>
                    <TableCell>
                      <EditReimbursementModal
                        reimbursement={reimbursement}
                        people={people}
                        events={events}
                        approvalContext={approvalContext}
                      />
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
