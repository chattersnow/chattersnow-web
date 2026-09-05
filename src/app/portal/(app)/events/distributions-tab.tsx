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
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

const COLUMNS: PortalDataTableColumn<EventDistributionRow>[] = [
  {
    key: "item",
    label: "Item",
    // Sorts on the description the cell shows, not on the category line under
    // it, which is only there to say what kind of thing it was.
    sortValue: (movement) => movement.inventory_item?.description,
    cellClassName: "max-w-xs font-medium",
    render: (movement) => (
      <>
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
      </>
    ),
  },
  {
    key: "quantity",
    label: "Qty",
    sortValue: (movement) => movement.quantity,
    render: (movement) => movement.quantity,
  },
  {
    key: "occurred_at",
    label: "Date",
    sortValue: (movement) => movement.occurred_at,
    cellClassName: "app-muted",
    render: (movement) => formatDateTime(movement.occurred_at),
  },
  {
    key: "reason",
    label: "Reason",
    sortValue: (movement) => movement.reason,
    cellClassName: "app-muted",
    render: (movement) => movement.reason || "—",
  },
];

const PREVIEW_COLUMNS = withoutSorting(COLUMNS);

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
  const list = useMemo(() => distributions ?? [], [distributions]);

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
  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewIsWholeList = !hasOverflow;

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
          <PortalDataTable
            columns={previewIsWholeList ? COLUMNS : PREVIEW_COLUMNS}
            rows={capped}
            getRowKey={(movement) => movement.id}
            // listEventDistributionsAction returns newest first.
            defaultSort={
              previewIsWholeList
                ? { key: "occurred_at", dir: "desc" }
                : undefined
            }
            emptyMessage="No distributions to show."
            // The tab is already inside its own card on the phase grid.
            shell="bare"
          />
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
              <PortalDataTable
                columns={COLUMNS}
                rows={filtered}
                getRowKey={(movement) => movement.id}
                defaultSort={{ key: "occurred_at", dir: "desc" }}
                emptyMessage="No distributions match your search. Clear or loosen it to see more."
                // The sheet body is the scroller here and brings its own
                // surface, so the header pins to the top of that rather than
                // to the portal's header.
                shell="bare"
                stickyHeader="container"
              />
            </ListPreviewSheet>
          )}
        </>
      )}
    </div>
  );
}
