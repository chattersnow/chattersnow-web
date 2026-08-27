"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LayoutGrid,
  List,
} from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EditInventoryModal } from "./edit-inventory-modal";
import { InventoryCard } from "./inventory-card";
import {
  CONDITIONS,
  GENDERS,
  STATUSES,
  StatusBadge,
  formatFaceValue,
  labelFor,
  type InventoryItem,
} from "./inventory-shared";

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

const INVENTORY_VIEW_STORAGE_KEY = "chattersnow:inventory-items-view";

function isViewMode(value: unknown): value is "list" | "gallery" {
  return value === "list" || value === "gallery";
}

function readStoredView(): "list" | "gallery" {
  if (typeof window === "undefined") return "list";
  try {
    const stored = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return isViewMode(stored) ? stored : "list";
  } catch {
    return "list";
  }
}

function compareNullableStrings(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function InventoryTable({ items }: { items: InventoryItem[] }) {
  const [view, setView] = useState<"list" | "gallery">(readStoredView);

  function setViewAndPersist(next: "list" | "gallery") {
    setView(next);
    try {
      window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private browsing, disabled storage, etc.)
    }
  }
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("description");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.type))).sort(),
    [items],
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
      if (query && !item.description.toLowerCase().includes(query))
        return false;
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
  }, [
    items,
    search,
    typeFilter,
    conditionFilter,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No inventory items yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-end gap-3">
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
              onValueChange={(value) =>
                setTypeFilter(value === FILTER_ALL ? null : value)
              }
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
                <SelectValue placeholder="Condition">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All conditions"
                      : (labelFor(CONDITIONS, value) ?? "Condition")
                  }
                </SelectValue>
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
              onValueChange={(value) =>
                setStatusFilter(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All statuses"
                      : (labelFor(STATUSES, value) ?? "Status")
                  }
                </SelectValue>
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

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              View
            </span>
            <ToggleGroup
              value={[view]}
              onValueChange={(value) => {
                if (value[0]) setViewAndPersist(value[0] as "list" | "gallery");
              }}
              variant="outline"
              className="h-8"
            >
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                className="h-8 px-2.5"
              >
                <List className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="gallery"
                aria-label="Gallery view"
                className="h-8 px-2.5"
              >
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      {view === "gallery" ? (
        visibleItems.length === 0 ? (
          <p className="app-muted py-16 text-center text-sm">
            No items match your filters.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visibleItems.map((item) => (
              <InventoryCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : (
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
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={SORT_COLUMNS.length + 1}
                      className="app-muted text-center"
                    >
                      No items match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell
                        className="max-w-xs whitespace-normal"
                        title={item.description}
                      >
                        {item.description}
                      </TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>{item.size ?? "—"}</TableCell>
                      <TableCell>
                        {labelFor(GENDERS, item.gender) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {labelFor(CONDITIONS, item.condition)}
                      </TableCell>
                      <TableCell>{formatFaceValue(item.face_value)}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        <EditInventoryModal item={item} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
