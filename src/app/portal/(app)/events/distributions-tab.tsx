"use client";

import { useMemo, useState } from "react";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import {
  listEventDistributionsAction,
  type EventDistributionRow,
} from "../home/distribution-actions";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function DistributionsTab({
  eventId,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  /** Rows before the rest move behind "View all"; `null` disables the cap. */
  previewRows?: number | null;
}) {
  const {
    data: distributions,
    loadError,
    refresh,
  } = useTabData<EventDistributionRow[]>(
    () => listEventDistributionsAction(eventId),
    [eventId],
  );

  useRegisterTabRefresh<TabValue>("distributions", refresh);

  const [query, setQuery] = useState("");
  const list = distributions ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((movement) =>
      [movement.inventory_item?.description, movement.reason].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    );
  }, [list, query]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;

  function movementsTable(rows: EventDistributionRow[], stickyHeader = false) {
    return (
      <Table>
        <TableHeader
          className={stickyHeader ? "sticky top-0 z-10 bg-popover" : undefined}
        >
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell className="max-w-xs font-medium">
                <span
                  className="block truncate"
                  title={movement.inventory_item?.description ?? undefined}
                >
                  {movement.inventory_item?.description ?? "—"}
                </span>
                <span className="app-muted block text-xs">
                  {movement.inventory_item
                    ? categoryLabelFor(flattenCategory(movement.inventory_item))
                    : null}
                </span>
              </TableCell>
              <TableCell>{movement.quantity}</TableCell>
              <TableCell className="app-muted">
                {formatDateTime(movement.occurred_at)}
              </TableCell>
              <TableCell className="app-muted">
                {movement.reason || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {distributions === undefined ? (
        <TabLoadingSkeleton />
      ) : distributions.length === 0 ? (
        <EmptyState
          title="No gear distributed at this event yet"
          description="Record the first handout with + Record distribution above."
        />
      ) : (
        <>
          {movementsTable(capped)}
          {hasOverflow && (
            <ListPreviewSheet
              title="Distributions"
              description={`${list.length} handouts recorded`}
              triggerLabel={`View all ${list.length} distributions`}
              searchPlaceholder="Search item or reason"
              searchLabel="Search distributions"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
            >
              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching distributions"
                  description="Clear or loosen the search to see more."
                />
              ) : (
                movementsTable(filtered, true)
              )}
            </ListPreviewSheet>
          )}
        </>
      )}
    </div>
  );
}
