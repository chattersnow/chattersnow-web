"use client";

import Link from "next/link";
import {
  listEventMonetaryDonationsAction,
  type EventMonetaryDonationRow,
  type EventMonetaryDonations,
} from "../finance/donations/actions";
import { donorLabel } from "../finance/donations/donations-shared";
import { PaymentMethodBadge } from "../finance/donations/donation-badges";
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
import { LIST_PREVIEW_ROWS } from "@/components/portal/list-preview-sheet";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { CashDonationsSummary } from "./card-summaries";

const COLUMNS: PortalDataTableColumn<EventMonetaryDonationRow>[] = [
  {
    key: "donor",
    label: "Donor",
    sortValue: (row) => donorLabel(row),
    cellClassName: "font-medium",
    render: (row) => (
      <>
        <span className="block">{donorLabel(row)}</span>
        {row.event_sponsors.length > 0 && (
          <span className="app-muted block text-xs">Sponsorship</span>
        )}
      </>
    ),
  },
  {
    key: "method",
    label: "Method",
    hideBelow: "sm",
    sortValue: (row) => row.method,
    render: (row) => <PaymentMethodBadge method={row.method} />,
  },
  {
    key: "received_date",
    label: "Date",
    hideBelow: "sm",
    sortValue: (row) => row.received_date,
    cellClassName: "app-muted",
    render: (row) => formatCalendarDate(row.received_date),
  },
  {
    key: "amount",
    label: "Amount",
    // Numeric, because amounts arrive from Postgres as strings and would
    // otherwise sort "100" before "9".
    sortValue: (row) => Number(row.amount),
    render: (row) => formatCurrency(row.amount),
  },
];

const PREVIEW_COLUMNS = withoutSorting(COLUMNS);

/**
 * Cash gifts linked to this event (#1577). Read-only: they are recorded and
 * edited in Finance > Donations, which this card links to filtered to the
 * event for a reader who may open it. A sponsorship's cash mirror is listed and marked, since it is a real
 * gift on the event; the Report card counts it once, under sponsorship.
 */
export function CashDonationsTab({
  eventId,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  /** Rows shown before the rest are left to Finance; `null` shows all. */
  previewRows?: number | null;
}) {
  const {
    data: donations,
    loadError,
    refresh,
  } = useTabData<EventMonetaryDonations>(
    () => listEventMonetaryDonationsAction(eventId),
    [eventId],
  );

  useRegisterTabRefresh<TabValue>("cash-donations", refresh);

  const rows = donations?.rows ?? [];
  const capped = previewRows === null ? rows : rows.slice(0, previewRows);
  const hasOverflow = previewRows !== null && rows.length > previewRows;
  const financeHref = `/portal/finance/donations?event=${encodeURIComponent(eventId)}`;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {donations === undefined ? (
        <TabLoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No cash donations linked to this event yet"
          description="A cash gift recorded in Finance › Donations with this event chosen appears here."
        />
      ) : (
        <>
          <CashDonationsSummary
            gifts={rows.map((row) => ({
              amount: row.amount,
              sponsor_id: row.event_sponsors[0]?.id ?? null,
            }))}
          />
          <PortalDataTable
            columns={hasOverflow ? PREVIEW_COLUMNS : COLUMNS}
            rows={capped}
            getRowKey={(row) => row.id}
            // listEventMonetaryDonationsAction returns newest first.
            defaultSort={
              hasOverflow ? undefined : { key: "received_date", dir: "desc" }
            }
            emptyMessage="No cash donations to show."
            // The tab is already inside its own card on the event page.
            shell="bare"
          />
          {donations?.canOpenLedger && (
            <p className="app-muted text-sm">
              <Link className="underline underline-offset-4" href={financeHref}>
                {hasOverflow
                  ? `View all ${rows.length} in Finance`
                  : "Open in Finance"}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
