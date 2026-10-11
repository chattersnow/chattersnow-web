// The event Report card's figures (#1576, part 1 of #1575). Rows arrive raw
// from get_event_report_data (20261011140000_event_report_data.sql) and every
// total is computed here, in unit-tested TypeScript, the same split as
// impact-metrics.ts and the finance rollup.
//
// Money reuses the finance definitions rather than a second copy, so an
// event's net here and on Finance > Financial Reports come from one function
// (summarizeByEvent) and agree. Guests are not computed here at all: the card
// shows the Impact definitions (EventImpactDerived) so a participant figure is
// never defined twice.

import {
  summarizeByEvent,
  summarizeRevenueBySource,
  summarizeSpendByStatus,
  sumSpendWithStatus,
  toNumber,
  type SpendReportRow,
  type StatusTotal,
} from "@/app/portal/(app)/finance/reports/summary";
import { computePeopleServed } from "@/lib/portal/impact-metrics";

type Amount = number | string | null;

export type EventReportMoneyRows = {
  budget_amount: Amount;
  sales: { amount: Amount; tax: Amount }[];
  revenue: { source: string; amount: Amount }[];
  giveaway_ticket_sales: { amount: Amount; quantity: number }[];
  /** `sponsor_id` is set when the gift is a sponsorship's cash mirror. */
  monetary_donations: { amount: Amount; sponsor_id: string | null }[];
  expenses: { status: string; amount: Amount }[];
  reimbursements: { status: string; amount: Amount }[];
};

export type EventReportGoodsRows = {
  /** `sponsor_id` is set when the item came in through a sponsorship. */
  in_kind_items: { face_value: Amount; sponsor_id: string | null }[];
  distributions: {
    quantity: number;
    recipient_person_id: string | null;
    inventory_item_id: string;
    face_value: Amount;
  }[];
  prizes: { estimated_value: Amount; awarded: boolean }[];
};

export type EventReportSponsorRow = {
  support_type: string;
  contribution_value: Amount;
  follow_up_status: string;
};

export type EventReportTeamRows = {
  volunteers: { person_id: string; shift_id: string | null }[];
  shifts: { id: string; target_headcount: number | null }[];
  volunteer_hours: { person_id: string; hours: Amount }[];
  staff: { person_id: string }[];
};

export type EventReportOperationsRows = {
  incidents: { severity: string }[];
};

/** Each section is null when the caller may not see it (see the migration). */
export type EventReportData = {
  money: EventReportMoneyRows | null;
  goods: EventReportGoodsRows | null;
  sponsors: EventReportSponsorRow[] | null;
  team: EventReportTeamRows | null;
  operations: EventReportOperationsRows | null;
};

export type IncomeStream = {
  /** A revenue source key, `merchandise`, `giveaway_tickets`, `cash_donations` or `cash_sponsorships`. */
  key: string;
  count: number;
  total: number;
};

export const CASH_DONATIONS_STREAM = "cash_donations";
export const CASH_SPONSORSHIPS_STREAM = "cash_sponsorships";

export type EventReportMoney = {
  incomeStreams: IncomeStream[];
  income: number;
  /** Collected on sales and held for remittance: outside income. */
  salesTax: number;
  expensesByStatus: StatusTotal[];
  reimbursementsByStatus: StatusTotal[];
  /** Expenses and reimbursements marked paid. */
  paidSpend: number;
  /** Approved but not yet paid: shown beside the net, never inside it. */
  committedSpend: number;
  /** Submitted and awaiting approval. */
  pendingSpend: number;
  /** Income less paid spend: Finance's per-event definition. */
  net: number;
  budget: number | null;
  /** Budget less paid and committed spend; null without a budget. */
  budgetRemaining: number | null;
};

export type EventReportGoods = {
  inKindReceived: { count: number; value: number };
  sponsorInKind: { count: number; value: number };
  distributed: {
    quantity: number;
    items: number;
    recipients: number;
    value: number;
  };
  prizes: { count: number; awarded: number; awardedValue: number };
};

export const SPONSOR_SUPPORT_TYPES = [
  "cash",
  "in_kind",
  "both",
  "other",
] as const;

export type EventReportSponsors = {
  count: number;
  bySupportType: Record<string, number>;
  /** Sum of each sponsorship's stated contribution value. */
  totalContributed: number;
  /** Follow-up or thank-you not yet marked done. */
  followUpOutstanding: number;
};

export type EventReportTeam = {
  volunteers: number;
  staff: number;
  shifts: number;
  /** Shifts with a target headcount whose assigned volunteers meet it. */
  shiftsFilled: number;
  shiftsWithTarget: number;
  /** Volunteers assigned to a shift with a target, capped at each target. */
  shiftSlotsFilled: number;
  targetHeadcount: number;
  volunteerHours: number;
};

export const INCIDENT_SEVERITIES = ["minor", "moderate", "serious"] as const;

export type EventReportOperations = {
  incidents: number;
  bySeverity: Record<string, number>;
};

export type EventReport = {
  money: EventReportMoney | null;
  goods: EventReportGoods | null;
  sponsors: EventReportSponsors | null;
  team: EventReportTeam | null;
  operations: EventReportOperations | null;
};

const sum = <T>(rows: readonly T[], value: (row: T) => Amount) =>
  rows.reduce((total, row) => total + toNumber(value(row)), 0);

// The finance row shapes carry an event id and name; one event's rows all
// share one, so the per-event rollup returns exactly one entry.
const THIS_EVENT = { event_id: "event", event_name: "event" };

export function computeEventMoney(
  rows: EventReportMoneyRows,
): EventReportMoney {
  const sales = rows.sales.map((row) => ({
    ...THIS_EVENT,
    amount: row.amount,
    tax: row.tax,
    sold_at: "",
  }));
  const revenue = rows.revenue.map((row) => ({ ...THIS_EVENT, ...row }));
  const giveawayTicketSales = rows.giveaway_ticket_sales.map((row) => ({
    ...THIS_EVENT,
    amount: row.amount,
  }));
  const donations = rows.monetary_donations.map((row) => ({
    ...THIS_EVENT,
    amount: row.amount,
    donor_name: null,
  }));
  const spend: SpendReportRow[] = [
    ...rows.expenses,
    ...rows.reimbursements,
  ].map((row) => ({ ...THIS_EVENT, ...row }));

  const [eventTotal] = summarizeByEvent(
    revenue,
    spend,
    donations,
    sales,
    giveawayTicketSales,
  );

  // A sponsorship's cash is mirrored into monetary_donations; it is counted
  // once, under sponsorship, never again as a donation.
  const sponsorCash = rows.monetary_donations.filter((row) => row.sponsor_id);
  const plainDonations = rows.monetary_donations.filter(
    (row) => !row.sponsor_id,
  );

  const incomeStreams: IncomeStream[] = [
    ...summarizeRevenueBySource(revenue, sales, giveawayTicketSales).map(
      ({ source, count, total }) => ({ key: source, count, total }),
    ),
    {
      key: CASH_DONATIONS_STREAM,
      count: plainDonations.length,
      total: sum(plainDonations, (row) => row.amount),
    },
    {
      key: CASH_SPONSORSHIPS_STREAM,
      count: sponsorCash.length,
      total: sum(sponsorCash, (row) => row.amount),
    },
  ].filter((stream) => stream.count > 0);

  const paidSpend = eventTotal?.paidSpend ?? 0;
  const committedSpend = sumSpendWithStatus(spend, "approved");
  const budget =
    rows.budget_amount === null ? null : toNumber(rows.budget_amount);

  return {
    incomeStreams,
    income: eventTotal?.income ?? 0,
    salesTax: sum(rows.sales, (row) => row.tax),
    expensesByStatus: summarizeSpendByStatus(
      rows.expenses.map((row) => ({ ...THIS_EVENT, ...row })),
    ),
    reimbursementsByStatus: summarizeSpendByStatus(
      rows.reimbursements.map((row) => ({ ...THIS_EVENT, ...row })),
    ),
    paidSpend,
    committedSpend,
    pendingSpend: sumSpendWithStatus(spend, "submitted"),
    net: eventTotal?.net ?? 0,
    budget,
    budgetRemaining:
      budget === null ? null : budget - paidSpend - committedSpend,
  };
}

export function computeEventGoods(
  rows: EventReportGoodsRows,
): EventReportGoods {
  const sponsorItems = rows.in_kind_items.filter((row) => row.sponsor_id);
  const donatedItems = rows.in_kind_items.filter((row) => !row.sponsor_id);

  // People served is Impact's definition (#1577), so the two cards agree.
  const served = computePeopleServed(
    rows.distributions.map((row) => ({ ...row, event_id: null })),
  );
  const distributedItems = new Set(
    rows.distributions.map((row) => row.inventory_item_id),
  );

  const awarded = rows.prizes.filter((prize) => prize.awarded);

  return {
    inKindReceived: {
      count: donatedItems.length,
      value: sum(donatedItems, (row) => row.face_value),
    },
    sponsorInKind: {
      count: sponsorItems.length,
      value: sum(sponsorItems, (row) => row.face_value),
    },
    distributed: {
      quantity: served.distributed,
      items: distributedItems.size,
      recipients: served.recipients,
      value: served.value,
    },
    prizes: {
      count: rows.prizes.length,
      awarded: awarded.length,
      awardedValue: sum(awarded, (prize) => prize.estimated_value),
    },
  };
}

export function computeEventSponsors(
  rows: EventReportSponsorRow[],
): EventReportSponsors {
  const bySupportType: Record<string, number> = Object.fromEntries(
    SPONSOR_SUPPORT_TYPES.map((type) => [type, 0]),
  );
  for (const row of rows) {
    bySupportType[row.support_type] =
      (bySupportType[row.support_type] ?? 0) + 1;
  }
  return {
    count: rows.length,
    bySupportType,
    totalContributed: sum(rows, (row) => row.contribution_value),
    followUpOutstanding: rows.filter((row) => row.follow_up_status !== "done")
      .length,
  };
}

export function computeEventTeam(rows: EventReportTeamRows): EventReportTeam {
  const assignedPerShift = new Map<string, number>();
  for (const volunteer of rows.volunteers) {
    if (!volunteer.shift_id) continue;
    assignedPerShift.set(
      volunteer.shift_id,
      (assignedPerShift.get(volunteer.shift_id) ?? 0) + 1,
    );
  }

  const targeted = rows.shifts.filter(
    (shift) => shift.target_headcount !== null && shift.target_headcount > 0,
  );
  let shiftsFilled = 0;
  let shiftSlotsFilled = 0;
  let targetHeadcount = 0;
  for (const shift of targeted) {
    const target = shift.target_headcount ?? 0;
    const assigned = assignedPerShift.get(shift.id) ?? 0;
    targetHeadcount += target;
    shiftSlotsFilled += Math.min(assigned, target);
    if (assigned >= target) shiftsFilled += 1;
  }

  return {
    volunteers: new Set(rows.volunteers.map((row) => row.person_id)).size,
    staff: new Set(rows.staff.map((row) => row.person_id)).size,
    shifts: rows.shifts.length,
    shiftsFilled,
    shiftsWithTarget: targeted.length,
    shiftSlotsFilled,
    targetHeadcount,
    volunteerHours: sum(rows.volunteer_hours, (row) => row.hours),
  };
}

export function computeEventOperations(
  rows: EventReportOperationsRows,
): EventReportOperations {
  const bySeverity: Record<string, number> = Object.fromEntries(
    INCIDENT_SEVERITIES.map((severity) => [severity, 0]),
  );
  for (const row of rows.incidents) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }
  return { incidents: rows.incidents.length, bySeverity };
}

export function computeEventReport(data: EventReportData): EventReport {
  return {
    money: data.money ? computeEventMoney(data.money) : null,
    goods: data.goods ? computeEventGoods(data.goods) : null,
    sponsors: data.sponsors ? computeEventSponsors(data.sponsors) : null,
    team: data.team ? computeEventTeam(data.team) : null,
    operations: data.operations
      ? computeEventOperations(data.operations)
      : null,
  };
}

/**
 * Whether a visible section has anything to show. An event with no money
 * recorded shows an empty state, not a column of $0.
 */
export function moneyHasData(money: EventReportMoney): boolean {
  return (
    money.incomeStreams.length > 0 ||
    money.budget !== null ||
    [...money.expensesByStatus, ...money.reimbursementsByStatus].some(
      (row) => row.count > 0,
    )
  );
}

export function goodsHasData(goods: EventReportGoods): boolean {
  return (
    goods.inKindReceived.count > 0 ||
    goods.sponsorInKind.count > 0 ||
    goods.distributed.quantity > 0 ||
    goods.prizes.count > 0
  );
}

export function teamHasData(team: EventReportTeam): boolean {
  return (
    team.volunteers > 0 ||
    team.staff > 0 ||
    team.shifts > 0 ||
    team.volunteerHours > 0
  );
}
