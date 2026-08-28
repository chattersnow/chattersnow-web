// Aggregation for the Financial Reports page (issue #353). Rows arrive raw
// from the get_finance_report_data RPC
// (20260828000000_create_finance_report_rollup_rpc.sql) and every total is
// computed here, in unit-tested TypeScript rather than SQL -- the same split
// the inventory (valuation.ts) and program impact (impact-rollup.ts) reports
// already use.

export type RevenueReportRow = {
  source: string;
  amount: number | string | null;
  event_id: string | null;
  event_name: string | null;
};

// event_expenses and reimbursements run the identical
// submitted -> approved/rejected -> paid workflow (20260826000000), so the
// report treats them as one "spend" shape and only splits them where the
// distinction matters to the reader.
export type SpendReportRow = {
  status: string;
  amount: number | string | null;
  event_id: string | null;
  event_name: string | null;
};

export type InKindItemRow = { face_value: number | string | null };

export type FinanceReportData = {
  revenue: RevenueReportRow[];
  expenses: SpendReportRow[];
  reimbursements: SpendReportRow[];
  in_kind_items: InKindItemRow[];
};

export const SPEND_STATUSES = [
  "submitted",
  "approved",
  "rejected",
  "paid",
] as const;

export const NO_EVENT_LABEL = "No event";

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

export type SourceTotal = { source: string; count: number; total: number };

export function summarizeRevenueBySource(
  rows: RevenueReportRow[],
): SourceTotal[] {
  const totals = new Map<string, SourceTotal>();
  for (const row of rows) {
    const key = row.source?.trim() || "other";
    const entry = totals.get(key) ?? { source: key, count: 0, total: 0 };
    entry.count += 1;
    entry.total += toNumber(row.amount);
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export type StatusTotal = { status: string; count: number; total: number };

// Always returns a row per status in SPEND_STATUSES order, zeros included, so
// the table's shape doesn't shift between periods and a reader can tell
// "nothing rejected" from "rejected not shown".
export function summarizeSpendByStatus(rows: SpendReportRow[]): StatusTotal[] {
  const totals = new Map<string, StatusTotal>(
    SPEND_STATUSES.map((status) => [status, { status, count: 0, total: 0 }]),
  );
  for (const row of rows) {
    const entry = totals.get(row.status) ?? {
      status: row.status,
      count: 0,
      total: 0,
    };
    entry.count += 1;
    entry.total += toNumber(row.amount);
    totals.set(row.status, entry);
  }
  return SPEND_STATUSES.map((status) => totals.get(status)!);
}

export function sumSpendWithStatus(
  rows: SpendReportRow[],
  status: string,
): number {
  return rows.reduce(
    (total, row) =>
      row.status === status ? total + toNumber(row.amount) : total,
    0,
  );
}

export type EventTotal = {
  eventId: string | null;
  eventName: string;
  income: number;
  paidSpend: number;
  net: number;
};

// Per-event spend counts paid rows only, matching the headline net -- an
// approved-but-unpaid cost hasn't left the bank yet, and mixing the two here
// would make the per-event column disagree with the summary card above it.
export function summarizeByEvent(
  revenue: RevenueReportRow[],
  spend: SpendReportRow[],
): EventTotal[] {
  const totals = new Map<string, EventTotal>();

  const entryFor = (eventId: string | null, eventName: string | null) => {
    const key = eventId ?? "";
    const entry = totals.get(key) ?? {
      eventId,
      eventName: eventName?.trim() || NO_EVENT_LABEL,
      income: 0,
      paidSpend: 0,
      net: 0,
    };
    totals.set(key, entry);
    return entry;
  };

  for (const row of revenue) {
    entryFor(row.event_id, row.event_name).income += toNumber(row.amount);
  }
  for (const row of spend) {
    if (row.status !== "paid") continue;
    entryFor(row.event_id, row.event_name).paidSpend += toNumber(row.amount);
  }

  return [...totals.values()]
    .map((entry) => ({ ...entry, net: entry.income - entry.paidSpend }))
    .sort(
      (a, b) =>
        b.income - a.income ||
        b.paidSpend - a.paidSpend ||
        a.eventName.localeCompare(b.eventName),
    );
}

export type FinanceSummary = {
  income: number;
  paidSpend: number;
  net: number;
  approvedUnpaidSpend: number;
  pendingSpend: number;
  inKindValue: number;
  inKindItemCount: number;
};

export function computeFinanceSummary(data: FinanceReportData): FinanceSummary {
  const income = data.revenue.reduce(
    (total, row) => total + toNumber(row.amount),
    0,
  );
  const spend = [...data.expenses, ...data.reimbursements];
  const paidSpend = sumSpendWithStatus(spend, "paid");

  return {
    income,
    paidSpend,
    // Cash only: in-kind face value is deliberately excluded, since donated
    // goods are not money received.
    net: income - paidSpend,
    approvedUnpaidSpend: sumSpendWithStatus(spend, "approved"),
    pendingSpend: sumSpendWithStatus(spend, "submitted"),
    inKindValue: data.in_kind_items.reduce(
      (total, item) => total + toNumber(item.face_value),
      0,
    ),
    inKindItemCount: data.in_kind_items.length,
  };
}

// Financial reporting is annual, so the page opens on year-to-date rather
// than the current month the inventory report defaults to. Both bounds come
// off the same UTC date so a run near midnight can't produce a range whose
// end precedes its start.
export function yearToDateRange(now: Date): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 4)}-01-01`, to };
}
