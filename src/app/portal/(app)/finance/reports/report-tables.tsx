"use client";

import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { isRevenueSource, revenueSourceLabel } from "../revenue/revenue-shared";
import type { EventTotal, SourceTotal } from "./summary";
import { formatCurrency, formatNumber } from "@/lib/format";

function sourceLabel(source: string) {
  return isRevenueSource(source) ? revenueSourceLabel(source) : source;
}

const SOURCE_COLUMNS: PortalDataTableColumn<SourceTotal>[] = [
  {
    key: "source",
    label: "Source",
    // The label, not the raw enum: "onsite_donations" would otherwise order
    // against "Registration fees".
    sortValue: (row) => sourceLabel(row.source),
    render: (row) => sourceLabel(row.source),
  },
  {
    key: "count",
    label: "Records",
    sortValue: (row) => row.count,
    render: (row) => formatNumber(row.count),
  },
  {
    key: "total",
    label: "Total",
    sortValue: (row) => row.total,
    render: (row) => formatCurrency(row.total),
  },
];

export function RevenueBySourceTable({ rows }: { rows: SourceTotal[] }) {
  return (
    <PortalDataTable
      columns={SOURCE_COLUMNS}
      rows={rows}
      getRowKey={(row) => row.source}
      // summarizeRevenueBySource already returns biggest-first; naming it as
      // the default sort is what puts the arrow on the column a reader is
      // looking at.
      defaultSort={{ key: "total", dir: "desc" }}
      emptyMessage="No revenue recorded in this period."
      shell="bare"
    />
  );
}

const EVENT_COLUMNS: PortalDataTableColumn<EventTotal>[] = [
  {
    key: "eventName",
    label: "Event",
    sortValue: (row) => row.eventName,
    // Event names are long enough to want the wrap the rest of the table
    // suppresses.
    cellClassName: "whitespace-normal",
    render: (row) => row.eventName,
  },
  {
    key: "income",
    label: "Income",
    sortValue: (row) => row.income,
    render: (row) => formatCurrency(row.income),
  },
  {
    key: "paidSpend",
    label: "Paid spend",
    sortValue: (row) => row.paidSpend,
    render: (row) => formatCurrency(row.paidSpend),
  },
  {
    key: "net",
    label: "Net",
    sortValue: (row) => row.net,
    render: (row) => formatCurrency(row.net),
  },
];

export function EventTotalsTable({ rows }: { rows: EventTotal[] }) {
  return (
    <PortalDataTable
      columns={EVENT_COLUMNS}
      rows={rows}
      // Revenue with no event is one row, keyed on the same empty-event key
      // summarizeByEvent groups it under.
      getRowKey={(row) => row.eventId ?? "no-event"}
      defaultSort={{ key: "income", dir: "desc" }}
      emptyMessage="Nothing recorded in this period."
      shell="bare"
    />
  );
}
