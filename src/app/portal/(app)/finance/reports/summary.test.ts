import { describe, expect, test } from "bun:test";
import {
  computeFinanceSummary,
  NO_EVENT_LABEL,
  summarizeByEvent,
  summarizeRevenueBySource,
  summarizeSpendByStatus,
  sumSpendWithStatus,
  toNumber,
  yearToDateRange,
  type FinanceReportData,
  type RevenueReportRow,
  type SpendReportRow,
} from "./summary";

// numeric(10,2) columns come back from PostgREST as strings, so every helper
// has to cope with both shapes.
describe("toNumber", () => {
  test("coerces numeric strings", () => {
    expect(toNumber("214.50")).toBe(214.5);
  });

  test("returns 0 for null and undefined", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  test("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("summarizeRevenueBySource", () => {
  const revenue: RevenueReportRow[] = [
    { source: "ticket_sales", amount: 100, event_id: "e1", event_name: "Jam" },
    { source: "ticket_sales", amount: "50", event_id: null, event_name: null },
    { source: "grants", amount: 500, event_id: null, event_name: null },
    { source: "  ", amount: 10, event_id: null, event_name: null },
  ];

  test("sums and counts per source, highest total first", () => {
    expect(summarizeRevenueBySource(revenue)).toEqual([
      { source: "grants", count: 1, total: 500 },
      { source: "ticket_sales", count: 2, total: 150 },
      { source: "other", count: 1, total: 10 },
    ]);
  });

  test("returns nothing for an empty period", () => {
    expect(summarizeRevenueBySource([])).toEqual([]);
  });
});

describe("summarizeSpendByStatus", () => {
  const spend: SpendReportRow[] = [
    { status: "paid", amount: 40, event_id: null, event_name: null },
    { status: "paid", amount: "60", event_id: null, event_name: null },
    { status: "submitted", amount: 25, event_id: null, event_name: null },
  ];

  test("keeps every workflow status, including the ones with no rows", () => {
    expect(summarizeSpendByStatus(spend)).toEqual([
      { status: "submitted", count: 1, total: 25 },
      { status: "approved", count: 0, total: 0 },
      { status: "rejected", count: 0, total: 0 },
      { status: "paid", count: 2, total: 100 },
    ]);
  });
});

describe("sumSpendWithStatus", () => {
  test("only totals rows in the given status", () => {
    const spend: SpendReportRow[] = [
      { status: "paid", amount: 10, event_id: null, event_name: null },
      { status: "rejected", amount: 999, event_id: null, event_name: null },
    ];
    expect(sumSpendWithStatus(spend, "paid")).toBe(10);
  });
});

describe("summarizeByEvent", () => {
  const revenue: RevenueReportRow[] = [
    { source: "ticket_sales", amount: 300, event_id: "e1", event_name: "Jam" },
    { source: "merchandise", amount: 20, event_id: null, event_name: null },
  ];
  const spend: SpendReportRow[] = [
    { status: "paid", amount: 100, event_id: "e1", event_name: "Jam" },
    // Not paid yet, so it must not move any event's net.
    { status: "approved", amount: 5000, event_id: "e1", event_name: "Jam" },
    { status: "paid", amount: 75, event_id: "e2", event_name: "Cleanup" },
  ];

  test("nets paid spend against income per event", () => {
    expect(summarizeByEvent(revenue, spend)).toEqual([
      {
        eventId: "e1",
        eventName: "Jam",
        income: 300,
        paidSpend: 100,
        net: 200,
      },
      {
        eventId: null,
        eventName: NO_EVENT_LABEL,
        income: 20,
        paidSpend: 0,
        net: 20,
      },
      {
        eventId: "e2",
        eventName: "Cleanup",
        income: 0,
        paidSpend: 75,
        net: -75,
      },
    ]);
  });

  test("groups every unassigned row under a single 'No event' entry", () => {
    const unassigned = summarizeByEvent(
      [{ source: "grants", amount: 10, event_id: null, event_name: null }],
      [{ status: "paid", amount: 4, event_id: null, event_name: null }],
    );
    expect(unassigned).toEqual([
      {
        eventId: null,
        eventName: NO_EVENT_LABEL,
        income: 10,
        paidSpend: 4,
        net: 6,
      },
    ]);
  });
});

describe("computeFinanceSummary", () => {
  const data: FinanceReportData = {
    revenue: [
      { source: "ticket_sales", amount: 800, event_id: null, event_name: null },
      { source: "grants", amount: "200", event_id: null, event_name: null },
    ],
    expenses: [
      { status: "paid", amount: 150, event_id: null, event_name: null },
      { status: "approved", amount: 60, event_id: null, event_name: null },
      { status: "submitted", amount: 30, event_id: null, event_name: null },
      { status: "rejected", amount: 9999, event_id: null, event_name: null },
    ],
    reimbursements: [
      { status: "paid", amount: "50", event_id: null, event_name: null },
      { status: "submitted", amount: 20, event_id: null, event_name: null },
    ],
    in_kind_items: [
      { face_value: 40 },
      { face_value: "60" },
      { face_value: null },
    ],
  };

  test("nets cash income against paid expenses and reimbursements", () => {
    const summary = computeFinanceSummary(data);
    expect(summary.income).toBe(1000);
    expect(summary.paidSpend).toBe(200);
    expect(summary.net).toBe(800);
  });

  test("reports approved-but-unpaid and pending spend separately", () => {
    const summary = computeFinanceSummary(data);
    expect(summary.approvedUnpaidSpend).toBe(60);
    expect(summary.pendingSpend).toBe(50);
  });

  test("keeps in-kind face value out of the cash net", () => {
    const summary = computeFinanceSummary(data);
    expect(summary.inKindValue).toBe(100);
    expect(summary.inKindItemCount).toBe(3);
    expect(summary.net).toBe(summary.income - summary.paidSpend);
  });

  test("rejected spend never reduces the net", () => {
    expect(computeFinanceSummary(data).net).toBe(800);
  });

  test("zeroes out on an empty period", () => {
    expect(
      computeFinanceSummary({
        revenue: [],
        expenses: [],
        reimbursements: [],
        in_kind_items: [],
      }),
    ).toEqual({
      income: 0,
      paidSpend: 0,
      net: 0,
      approvedUnpaidSpend: 0,
      pendingSpend: 0,
      inKindValue: 0,
      inKindItemCount: 0,
    });
  });
});

describe("yearToDateRange", () => {
  test("runs from January 1st of the current year to today", () => {
    expect(yearToDateRange(new Date("2026-08-28T12:00:00.000Z"))).toEqual({
      from: "2026-01-01",
      to: "2026-08-28",
    });
  });

  test("never returns a range whose end precedes its start", () => {
    expect(yearToDateRange(new Date("2026-01-01T00:00:00.000Z"))).toEqual({
      from: "2026-01-01",
      to: "2026-01-01",
    });
  });
});
