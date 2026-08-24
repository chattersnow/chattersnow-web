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
import { CalendarItemDetailsSheet } from "./calendar-item-details-sheet";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  CategoryBadges,
  NeedsDecisionFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
} from "./calendar-badges";
import {
  isPastUndecided,
  labelFor,
  needsDecision,
  ownerEmail,
  ITEM_TYPES,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export type ListSortColumn =
  "title" | "starts_at" | "priority_tier" | "calendar_status";

const SORT_COLUMN_BEFORE_TYPE: { key: ListSortColumn; label: string }[] = [
  { key: "title", label: "Title" },
];
const SORT_COLUMNS_AFTER_TYPE: { key: ListSortColumn; label: string }[] = [
  { key: "starts_at", label: "Starts" },
  { key: "priority_tier", label: "Priority" },
  { key: "calendar_status", label: "Status" },
];

export function ListView({
  items,
  owners,
  programs,
  defaultLeadTimeDays,
  canManage,
  sort,
  dir,
  sortHref,
}: {
  items: CalendarItemRow[];
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  sort: ListSortColumn;
  dir: "asc" | "desc";
  sortHref: (column: ListSortColumn) => string;
}) {
  function SortIcon({ column }: { column: ListSortColumn }) {
    if (sort !== column)
      return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    return dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="px-0">
        {items.length === 0 ? (
          <p className="app-muted px-4 py-6 text-sm">
            No calendar items match these filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {SORT_COLUMN_BEFORE_TYPE.map((column) => (
                  <TableHead key={column.key}>
                    <Link
                      href={sortHref(column.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.label}
                      <SortIcon column={column.key} />
                    </Link>
                  </TableHead>
                ))}
                <TableHead>Type</TableHead>
                {SORT_COLUMNS_AFTER_TYPE.map((column) => (
                  <TableHead key={column.key}>
                    <Link
                      href={sortHref(column.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.label}
                      <SortIcon column={column.key} />
                    </Link>
                  </TableHead>
                ))}
                <TableHead>Visibility</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      {item.title}
                      <div className="flex flex-wrap gap-1">
                        {needsDecision(item) && <NeedsDecisionFlag />}
                        {isPastUndecided(item) && <PastUndecidedFlag />}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="app-muted">
                    {labelFor(ITEM_TYPES, item.item_type)}
                  </TableCell>
                  <TableCell>
                    {dateFormatter.format(new Date(item.starts_at))}
                  </TableCell>
                  <TableCell>
                    <PriorityTierBadge tier={item.priority_tier} />
                  </TableCell>
                  <TableCell>
                    <CalendarStatusBadge status={item.calendar_status} />
                  </TableCell>
                  <TableCell>
                    <CalendarVisibilityBadge visibility={item.visibility} />
                  </TableCell>
                  <TableCell className="app-muted">
                    {ownerEmail(owners, item.owner_id)}
                  </TableCell>
                  <TableCell>
                    <CategoryBadges categories={item.categories} />
                  </TableCell>
                  <TableCell className="text-right">
                    <CalendarItemDetailsSheet
                      item={item}
                      owners={owners}
                      programs={programs}
                      defaultLeadTimeDays={defaultLeadTimeDays}
                      canManage={canManage}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
