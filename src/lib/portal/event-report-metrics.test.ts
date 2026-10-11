import { describe, expect, test } from "bun:test";
import {
  CASH_DONATIONS_STREAM,
  CASH_SPONSORSHIPS_STREAM,
  computeEventGoods,
  computeEventMoney,
  computeEventOperations,
  computeEventReport,
  computeEventSponsors,
  computeEventTeam,
  goodsHasData,
  moneyHasData,
  teamHasData,
  type EventReportMoneyRows,
} from "./event-report-metrics";
import {
  GIVEAWAY_TICKETS_SOURCE,
  MERCHANDISE_SOURCE,
  summarizeByEvent,
} from "@/app/portal/(app)/finance/reports/summary";

const EMPTY_MONEY: EventReportMoneyRows = {
  budget_amount: null,
  sales: [],
  revenue: [],
  giveaway_ticket_sales: [],
  monetary_donations: [],
  expenses: [],
  reimbursements: [],
};

describe("computeEventMoney", () => {
  // numeric(10,2) arrives from PostgREST as a string.
  const rows: EventReportMoneyRows = {
    budget_amount: "500",
    sales: [{ amount: "100", tax: "8.25" }],
    revenue: [{ source: "ticket_sales", amount: 200 }],
    giveaway_ticket_sales: [{ amount: 40, quantity: 8 }],
    monetary_donations: [
      { amount: 50, sponsor_id: null },
      { amount: "250", sponsor_id: "sponsor-1" },
    ],
    expenses: [
      { status: "paid", amount: 120 },
      { status: "approved", amount: 60 },
      { status: "submitted", amount: 30 },
      { status: "rejected", amount: 999 },
    ],
    reimbursements: [{ status: "paid", amount: "30" }],
  };

  test("nets income against paid spend only", () => {
    const money = computeEventMoney(rows);
    expect(money.income).toBe(100 + 200 + 40 + 50 + 250);
    expect(money.paidSpend).toBe(150);
    expect(money.net).toBe(640 - 150);
  });

  test("reports approved-but-unpaid spend as committed, outside the net", () => {
    const money = computeEventMoney(rows);
    expect(money.committedSpend).toBe(60);
    expect(money.pendingSpend).toBe(30);
    expect(money.budget).toBe(500);
    expect(money.budgetRemaining).toBe(500 - 150 - 60);
  });

  test("agrees with the Finance per-event rollup", () => {
    const tag = { event_id: "e1", event_name: "Jam" };
    const [finance] = summarizeByEvent(
      rows.revenue.map((row) => ({ ...tag, ...row })),
      [...rows.expenses, ...rows.reimbursements].map((row) => ({
        ...tag,
        ...row,
      })),
      rows.monetary_donations.map((row) => ({
        ...tag,
        amount: row.amount,
        donor_name: null,
      })),
      rows.sales.map((row) => ({ ...tag, ...row, sold_at: "" })),
      rows.giveaway_ticket_sales.map((row) => ({ ...tag, amount: row.amount })),
    );
    const money = computeEventMoney(rows);
    expect(money.income).toBe(finance.income);
    expect(money.net).toBe(finance.net);
  });

  test("counts a sponsorship's mirrored cash once, under sponsorship", () => {
    const streams = Object.fromEntries(
      computeEventMoney(rows).incomeStreams.map((s) => [s.key, s.total]),
    );
    expect(streams[CASH_DONATIONS_STREAM]).toBe(50);
    expect(streams[CASH_SPONSORSHIPS_STREAM]).toBe(250);
    expect(streams[MERCHANDISE_SOURCE]).toBe(100);
    expect(streams[GIVEAWAY_TICKETS_SOURCE]).toBe(40);
    const streamTotal = computeEventMoney(rows).incomeStreams.reduce(
      (total, stream) => total + stream.total,
      0,
    );
    expect(streamTotal).toBe(computeEventMoney(rows).income);
  });

  test("keeps sales tax out of income", () => {
    expect(computeEventMoney(rows).salesTax).toBe(8.25);
  });

  test("an event with nothing recorded has no data", () => {
    const money = computeEventMoney(EMPTY_MONEY);
    expect(money.incomeStreams).toEqual([]);
    expect(money.budgetRemaining).toBeNull();
    expect(moneyHasData(money)).toBe(false);
    expect(moneyHasData(computeEventMoney(rows))).toBe(true);
  });
});

describe("computeEventGoods", () => {
  const goods = computeEventGoods({
    in_kind_items: [
      { face_value: 20, sponsor_id: null },
      { face_value: "30", sponsor_id: null },
      { face_value: 400, sponsor_id: "sponsor-1" },
    ],
    distributions: [
      {
        quantity: 1,
        recipient_person_id: "p1",
        inventory_item_id: "i1",
        face_value: 20,
      },
      {
        quantity: 2,
        recipient_person_id: "p1",
        inventory_item_id: "i2",
        face_value: "15",
      },
      {
        quantity: 1,
        recipient_person_id: null,
        inventory_item_id: "i2",
        face_value: "15",
      },
    ],
    prizes: [
      { estimated_value: 100, awarded: true },
      { estimated_value: 50, awarded: false },
    ],
  });

  test("counts sponsor in-kind items once, under sponsorship", () => {
    expect(goods.inKindReceived).toEqual({ count: 2, value: 50 });
    expect(goods.sponsorInKind).toEqual({ count: 1, value: 400 });
  });

  test("counts distinct recipients and each item's value once", () => {
    expect(goods.distributed).toEqual({
      quantity: 4,
      items: 2,
      recipients: 1,
      value: 35,
    });
  });

  test("reports prizes awarded", () => {
    expect(goods.prizes).toEqual({ count: 2, awarded: 1, awardedValue: 100 });
    expect(goodsHasData(goods)).toBe(true);
  });
});

describe("computeEventSponsors", () => {
  test("counts by support type and outstanding follow-up", () => {
    expect(
      computeEventSponsors([
        {
          support_type: "cash",
          contribution_value: "250",
          follow_up_status: "done",
        },
        {
          support_type: "in_kind",
          contribution_value: 400,
          follow_up_status: "in_progress",
        },
        {
          support_type: "in_kind",
          contribution_value: null,
          follow_up_status: "not_started",
        },
      ]),
    ).toEqual({
      count: 3,
      bySupportType: { cash: 1, in_kind: 2, both: 0, other: 0 },
      totalContributed: 650,
      followUpOutstanding: 2,
    });
  });
});

describe("computeEventTeam", () => {
  test("measures shifts against their target headcount", () => {
    const team = computeEventTeam({
      volunteers: [
        { person_id: "v1", shift_id: "s1" },
        { person_id: "v2", shift_id: "s1" },
        { person_id: "v3", shift_id: "s1" },
        { person_id: "v4", shift_id: "s2" },
        { person_id: "v5", shift_id: null },
      ],
      shifts: [
        { id: "s1", target_headcount: 2 },
        { id: "s2", target_headcount: 3 },
        { id: "s3", target_headcount: null },
      ],
      volunteer_hours: [
        { person_id: "v1", hours: "2.5" },
        { person_id: "v2", hours: 4 },
      ],
      staff: [{ person_id: "st1" }],
    });
    expect(team).toEqual({
      volunteers: 5,
      staff: 1,
      shifts: 3,
      shiftsFilled: 1,
      shiftsWithTarget: 2,
      // s1 is capped at its target of 2; s2 has 1 of 3.
      shiftSlotsFilled: 3,
      targetHeadcount: 5,
      volunteerHours: 6.5,
    });
    expect(teamHasData(team)).toBe(true);
  });
});

describe("computeEventOperations", () => {
  test("counts incidents by severity", () => {
    expect(
      computeEventOperations({
        incidents: [{ severity: "minor" }, { severity: "serious" }],
      }),
    ).toEqual({
      incidents: 2,
      bySeverity: { minor: 1, moderate: 0, serious: 1 },
    });
  });
});

describe("computeEventReport", () => {
  test("leaves a section the caller may not see null", () => {
    expect(
      computeEventReport({
        money: EMPTY_MONEY,
        goods: null,
        sponsors: null,
        team: null,
        operations: null,
      }),
    ).toMatchObject({
      goods: null,
      sponsors: null,
      team: null,
      operations: null,
    });
  });
});
