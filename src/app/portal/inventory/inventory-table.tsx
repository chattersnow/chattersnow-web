"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddDonationModal } from "../home/add-donation-modal";
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
import { cn } from "@/lib/utils";

type InventoryItem = {
  id: string;
  description: string;
  type: string;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | string | null;
  status: string;
};

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const GENDERS = [
  { value: "unisex", label: "Unisex" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "available", label: "Available" },
  { value: "distributed", label: "Distributed" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

function labelFor(options: { value: string; label: string }[], value: string | null) {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatFaceValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

type SortKey =
  | "description"
  | "type"
  | "size"
  | "gender"
  | "condition"
  | "face_value"
  | "status";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "type", label: "Type" },
  { key: "size", label: "Size" },
  { key: "gender", label: "Gender" },
  { key: "condition", label: "Condition" },
  { key: "face_value", label: "Face value" },
  { key: "status", label: "Status" },
];

const FILTER_ALL = "all";

function compareNullableStrings(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function InventoryTable({ items }: { items: InventoryItem[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("description");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.type))).sort(),
    [items]
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (conditionFilter && item.condition !== conditionFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (query && !item.description.toLowerCase().includes(query)) return false;
      return true;
    });

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortKey === "face_value") {
        const aValue = a.face_value === null ? null : Number(a.face_value);
        const bValue = b.face_value === null ? null : Number(b.face_value);
        if (aValue === bValue) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;
        return (aValue - bValue) * direction;
      }

      return compareNullableStrings(a[sortKey], b[sortKey]) * direction;
    });
  }, [items, search, typeFilter, conditionFilter, statusFilter, sortKey, sortDirection]);

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <AddDonationModal triggerLabel="Add item" />
        <p className="app-muted py-16 text-center text-sm">
          No inventory items yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AddDonationModal triggerLabel="Add item" />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="inventory-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="inventory-search"
              placeholder="Search description..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full sm:w-64"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Type
            </label>
            <Select
              value={typeFilter ?? FILTER_ALL}
              onValueChange={(value) => setTypeFilter(value === FILTER_ALL ? null : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All types</SelectItem>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Condition
            </label>
            <Select
              value={conditionFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setConditionFilter(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All conditions</SelectItem>
                {CONDITIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </label>
            <Select
              value={statusFilter ?? FILTER_ALL}
              onValueChange={(value) => setStatusFilter(value === FILTER_ALL ? null : value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                {STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={SORT_COLUMNS.length} className="app-muted text-center">
                    No items match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">{item.description}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size ?? "—"}</TableCell>
                    <TableCell>{labelFor(GENDERS, item.gender) ?? "—"}</TableCell>
                    <TableCell>{labelFor(CONDITIONS, item.condition)}</TableCell>
                    <TableCell>{formatFaceValue(item.face_value)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          item.status === "available" && "bg-primary/10 text-primary",
                          item.status !== "available" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {labelFor(STATUSES, item.status)}
                      </span>
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
