"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildHref } from "@/lib/pagination";
import { EditInventoryModal } from "./edit-inventory-modal";
import { InventoryCard } from "./inventory-card";
import { useInventoryView } from "./inventory-view-context";
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
  const { view } = useInventoryView();

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
