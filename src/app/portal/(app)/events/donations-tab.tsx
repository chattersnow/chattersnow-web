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
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatCurrency, formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

/**
 * One donated item, carrying the two fields that live on the donation it
 * arrived in. The table lists items rather than donations, because a single
 * donation of twenty pairs of gloves is twenty things the inventory holds.
 */
type DonatedItem = EventDonationRow["inventory_items"][number] & {
  donatedAt: string;
  donorLabel: string;
};

const COLUMNS: PortalDataTableColumn<DonatedItem>[] = [
  {
    key: "description",
    label: "Item",
    // Sorts on the description the cell shows, not on the category line under
    // it, which is only there to say what kind of thing it was.
    sortValue: (item) => item.description,
    cellClassName: "max-w-xs font-medium",
    render: (item) => (
      <>
        <span className="block truncate" title={item.description}>
          {item.description}
        </span>
        <span className="app-muted block text-xs">
          {categoryLabelFor(flattenCategory(item))}
        </span>
      </>
    ),
  },
  {
    key: "donor",
    label: "Donor",
    sortValue: (item) => item.donorLabel,
    cellClassName: "app-muted",
    render: (item) => item.donorLabel,
  },
  {
    key: "condition",
    label: "Condition",
    sortValue: (item) => item.condition,
    cellClassName: "app-muted capitalize",
    render: (item) => item.condition.replace("_", " "),
  },
  {
    key: "face_value",
    label: "Value",
    // Numeric, because face values arrive from Postgres as strings and would
    // otherwise sort "100" before "9".
    sortValue: (item) =>
      item.face_value === null ? null : Number(item.face_value),
    render: (item) => formatCurrency(item.face_value),
  },
  {
    key: "donatedAt",
    label: "Date",
    sortValue: (item) => item.donatedAt,
    cellClassName: "app-muted",
    render: (item) => formatInstantDate(item.donatedAt),
  },
];

const PREVIEW_COLUMNS = withoutSorting(COLUMNS);

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

  const items = useMemo<DonatedItem[]>(
    () =>
      (donations ?? []).flatMap((donation) =>
        donation.inventory_items.map((item) => ({
          ...item,
          donatedAt: donation.donated_at,
          donorLabel: donation.donor?.is_anonymous
            ? "Anonymous"
            : donation.donor?.name || "—",
        })),
      ),
    [donations],
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

      {donations === undefined ? (
        <TabLoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="No donations recorded for this event yet"
          description="Add the first one with Record donation for this event above."
        />
      ) : (
        <>
          <PortalDataTable
            columns={previewIsWholeList ? COLUMNS : PREVIEW_COLUMNS}
            rows={capped}
            getRowKey={(item) => item.id}
            // listEventDonationsAction returns newest first.
            defaultSort={
              previewIsWholeList ? { key: "donatedAt", dir: "desc" } : undefined
            }
            emptyMessage="No donated items to show."
            // The tab is already inside its own card on the phase grid.
            shell="bare"
          />
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
              <PortalDataTable
                columns={COLUMNS}
                rows={filtered}
                getRowKey={(item) => item.id}
                defaultSort={{ key: "donatedAt", dir: "desc" }}
                emptyMessage="No donated items match your search. Clear or loosen it to see more."
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
