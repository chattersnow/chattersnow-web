"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LayoutGrid,
  List,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildHref } from "@/lib/pagination";
import { EditInventoryModal } from "./edit-inventory-modal";
import { InventoryCard } from "./inventory-card";
import {
  CONDITIONS,
  GENDERS,
  SORT_COLUMNS,
  StatusBadge,
  formatFaceValue,
  labelFor,
  type InventoryItem,
  type SortColumn,
} from "./inventory-shared";

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

export function InventoryTable({
  items,
  sort,
  dir,
  filterQueryString,
  hasActiveFilters,
}: {
  items: InventoryItem[];
  sort: SortColumn;
  dir: "asc" | "desc";
  filterQueryString: string;
  hasActiveFilters: boolean;
}) {
  const [view, setView] = useState<"list" | "gallery">(readStoredView);

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref(
      "/portal/inventory/items",
      new URLSearchParams(filterQueryString),
      { sort: column, dir: nextDir },
    );
  }

  function setViewAndPersist(next: "list" | "gallery") {
    setView(next);
    try {
      window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private browsing, disabled storage, etc.)
    }
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              {hasActiveFilters
                ? "No items match your filters."
                : "No inventory items yet."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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

      {view === "gallery" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <InventoryCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {SORT_COLUMNS.map((column) => (
                    <TableHead key={column.key}>
                      <Link
                        href={sortHref(column.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.label}
                        {sort === column.key ? (
                          dir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 text-muted-foreground" />
                        )}
                      </Link>
                    </TableHead>
                  ))}
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
