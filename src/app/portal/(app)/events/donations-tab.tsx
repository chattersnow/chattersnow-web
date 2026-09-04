"use client";

import { useMemo, useState } from "react";
import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import {
  listEventDonationsAction,
  type EventDonationRow,
} from "../home/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
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
import { formatCurrency, formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function DonationsTab({
  eventId,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  /** Rows before the rest move behind "View all"; `null` disables the cap. */
  previewRows?: number | null;
}) {
  const {
    data: donations,
    loadError,
    refresh,
  } = useTabData<EventDonationRow[]>(
    () => listEventDonationsAction(eventId),
    [eventId],
  );

  useRegisterTabRefresh<TabValue>("donations", refresh);

  const [query, setQuery] = useState("");

  const items = (donations ?? []).flatMap((donation) =>
    donation.inventory_items.map((item) => ({
      ...item,
      donatedAt: donation.donated_at,
      donorLabel: donation.donor?.is_anonymous
        ? "Anonymous"
        : donation.donor?.name || "—",
    })),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.description, item.donorLabel, item.condition].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    );
  }, [items, query]);

  const capped = previewRows === null ? items : items.slice(0, previewRows);
  const hasOverflow = previewRows !== null && items.length > previewRows;

  function itemsTable(rows: typeof items, stickyHeader = false) {
    return (
      <Table>
        <TableHeader
          className={stickyHeader ? "sticky top-0 z-10 bg-popover" : undefined}
        >
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Donor</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-xs font-medium">
                <span className="block truncate" title={item.description}>
                  {item.description}
                </span>
                <span className="app-muted block text-xs">
                  {categoryLabelFor(flattenCategory(item))}
                </span>
              </TableCell>
              <TableCell className="app-muted">{item.donorLabel}</TableCell>
              <TableCell className="app-muted capitalize">
                {item.condition.replace("_", " ")}
              </TableCell>
              <TableCell>{formatCurrency(item.face_value)}</TableCell>
              <TableCell className="app-muted">
                {formatInstantDate(item.donatedAt)}
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

      {donations === undefined ? (
        <TabLoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="No donations recorded for this event yet"
          description="Add the first one with Record donation for this event above."
        />
      ) : (
        <>
          {itemsTable(capped)}
          {hasOverflow && (
            <ListPreviewSheet
              title="Donations"
              description={`${items.length} donated items`}
              triggerLabel={`View all ${items.length} donated items`}
              searchPlaceholder="Search item, donor, or condition"
              searchLabel="Search donations"
              query={query}
              onQueryChange={setQuery}
              totalCount={items.length}
              filteredCount={filtered.length}
            >
              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching donations"
                  description="Clear or loosen the search to see more."
                />
              ) : (
                itemsTable(filtered, true)
              )}
            </ListPreviewSheet>
          )}
        </>
      )}
    </div>
  );
}
