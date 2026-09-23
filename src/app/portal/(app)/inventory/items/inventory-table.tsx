"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { labelsHref } from "@/lib/inventory-labels";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import { buildHref } from "@/lib/pagination";
import { EditInventoryModal } from "./edit-inventory-modal";
import { InventoryCard } from "./inventory-card";
import { useInventoryView } from "./inventory-view-context";
import {
  CONDITIONS,
  categoryLabelFor,
  GENDERS,
  IntendedUseBadge,
  SORT_COLUMNS,
  StatusBadge,
  formatFaceValue,
  labelFor,
  type InventoryItem,
  type SortColumn,
} from "./inventory-shared";
import { EmptyState } from "@/components/portal/empty-state";
import type { InventoryCategory } from "@/lib/inventory";

export function InventoryTable({
  items,
  categories,
  sort,
  dir,
  filterQueryString,
  hasActiveFilters,
  openItemId = null,
}: {
  items: InventoryItem[];
  categories: InventoryCategory[];
  sort: SortColumn;
  dir: "asc" | "desc";
  filterQueryString: string;
  hasActiveFilters: boolean;
  /** The item whose sheet starts open -- a scanned tag's (#1420). */
  openItemId?: string | null;
}) {
  const { view } = useInventoryView();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ids from a previous page or filter can linger in the set; only the rows
  // on screen count, intersected here rather than synced in an effect.
  const visibleSelectedIds = items
    .map((item) => item.id)
    .filter((id) => selectedIds.has(id));
  const allSelected =
    items.length > 0 && visibleSelectedIds.length === items.length;
  const someSelected = visibleSelectedIds.length > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(items.map((item) => item.id)) : new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref(
      "/portal/inventory/items",
      new URLSearchParams(filterQueryString),
      { sort: column, dir: nextDir },
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="px-0">
            {hasActiveFilters ? (
              <EmptyState
                title="No items match your filters"
                description="Clear or loosen the filters to see more."
              />
            ) : (
              <EmptyState
                title="No inventory items yet"
                description="Items are added by recording a donation under Inventory › Donations."
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === "gallery" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              categories={categories}
              defaultOpen={item.id === openItemId}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="px-0">
            {visibleSelectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
                <span className="text-sm font-medium">
                  {visibleSelectedIds.length} selected
                </span>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href={labelsHref(visibleSelectedIds)} />}
                >
                  <Printer /> Print labels
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear selection
                </Button>
              </div>
            )}
            <Table stickyHeader="page">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-px">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) => toggleAll(checked)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  {SORT_COLUMNS.map((column) => (
                    <TableHead
                      key={column.key}
                      hideBelow={column.hideBelow}
                      sortDirection={sort === column.key ? dir : null}
                    >
                      <SortHeaderLink
                        href={sortHref(column.key)}
                        label={column.label}
                        dir={sort === column.key ? dir : null}
                      />
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
                    <TableCell className="w-px">
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(checked) =>
                          toggleRow(item.id, checked)
                        }
                        aria-label={`Select ${item.description}`}
                      />
                    </TableCell>
                    <TableCell
                      className="max-w-xs whitespace-normal"
                      title={item.description}
                    >
                      {item.description}
                    </TableCell>
                    <TableCell>{categoryLabelFor(item)}</TableCell>
                    <TableCell hideBelow="md">{item.size ?? "—"}</TableCell>
                    <TableCell hideBelow="lg">
                      {labelFor(GENDERS, item.gender) ?? "—"}
                    </TableCell>
                    <TableCell hideBelow="lg">
                      {labelFor(CONDITIONS, item.condition)}
                    </TableCell>
                    <TableCell hideBelow="md">
                      {formatFaceValue(item.face_value)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell hideBelow="lg">
                      <IntendedUseBadge intendedUse={item.intended_use} />
                    </TableCell>
                    <TableCell>
                      <EditInventoryModal
                        item={item}
                        categories={categories}
                        defaultOpen={item.id === openItemId}
                      />
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
