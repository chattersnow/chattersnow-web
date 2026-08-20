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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditExpenseModal } from "./edit-expense-modal";
import { NewExpenseDialog } from "./new-expense-dialog";
import { formatAmount, formatExpenseDate, type EventOption, type ExpenseRow } from "./expenses-shared";

type SortKey = "expense_date" | "description" | "amount";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "expense_date", label: "Date" },
  { key: "amount", label: "Amount" },
];

const FILTER_ALL = "all";

export function ExpensesTable({ expenses, events }: { expenses: ExpenseRow[]; events: EventOption[] }) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("expense_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = expenses.filter((expense) => {
      if (eventFilter === "none" && expense.event_id) return false;
      if (eventFilter && eventFilter !== "none" && expense.event_id !== eventFilter) return false;
      if (query && !expense.description.toLowerCase().includes(query)) return false;
      return true;
    });

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") {
        return (Number(a.amount) - Number(b.amount)) * direction;
      }
      return a[sortKey].localeCompare(b[sortKey]) * direction;
    });
  }, [expenses, search, eventFilter, sortKey, sortDirection]);

  if (expenses.length === 0) {
    return (
      <div className="space-y-4">
        <NewExpenseDialog events={events} />
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">No expenses recorded yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <NewExpenseDialog events={events} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="expenses-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="expenses-search"
              placeholder="Search description..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full sm:w-64"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">Event</span>
            <Select
              value={eventFilter ?? FILTER_ALL}
              onValueChange={(value) => setEventFilter(value === FILTER_ALL ? null : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Event">
                  {(value: string) => {
                    if (value === FILTER_ALL) return "All expenses";
                    if (value === "none") return "No event";
                    return events.find((event) => event.id === value)?.name ?? "Event";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All expenses</SelectItem>
                <SelectItem value="none">No event</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
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
                <TableHead>Event</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={SORT_COLUMNS.length + 2} className="app-muted text-center">
                    No expenses match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-normal">{expense.description}</TableCell>
                    <TableCell>{formatExpenseDate(expense.expense_date)}</TableCell>
                    <TableCell>{formatAmount(expense.amount, expense.currency)}</TableCell>
                    <TableCell className="app-muted">{expense.events?.name ?? "—"}</TableCell>
                    <TableCell>
                      <EditExpenseModal expense={expense} events={events} />
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
