// The figures at the top of an event card (#1586). Each summary is computed
// from every row the card loaded -- not the preview it shows -- through the
// Report card's definitions in event-report-metrics.ts, so a card and the
// Report never disagree about the same figure.

import {
  CASH_DONATIONS_STREAM,
  CASH_SPONSORSHIPS_STREAM,
  computeEventGoods,
  computeEventMoney,
  computeEventSponsors,
  computeEventTeam,
  SPONSOR_SUPPORT_TYPES,
  type EventReportMoneyRows,
} from "@/lib/portal/event-report-metrics";
import { formatCurrency, formatNumber } from "@/lib/format";
import { CardSummary, Figure } from "./summary-figures";

type Amount = number | string | null;

const NO_MONEY: EventReportMoneyRows = {
  budget_amount: null,
  sales: [],
  revenue: [],
  giveaway_ticket_sales: [],
  monetary_donations: [],
  expenses: [],
  reimbursements: [],
};

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  cash: "cash",
  in_kind: "in kind",
  both: "cash and in kind",
  other: "other",
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export function VolunteersSummary({
  volunteers,
  shifts,
  hours,
}: {
  volunteers: { person_id: string; shift_id: string | null }[];
  shifts: { id: string; target_headcount: number | null }[];
  hours: { person_id: string; hours: Amount }[];
}) {
  const team = computeEventTeam({
    volunteers,
    shifts,
    volunteer_hours: hours,
    staff: [],
  });
  if (team.volunteers === 0 && team.shifts === 0 && team.volunteerHours === 0)
    return null;

  return (
    <CardSummary label="Volunteers summary">
      <Figure label="Volunteers" value={formatNumber(team.volunteers)} />
      {team.shiftsWithTarget > 0 && (
        <Figure
          label="Shift slots filled"
          value={`${formatNumber(team.shiftSlotsFilled)} of ${formatNumber(team.targetHeadcount)}`}
          caption={`${formatNumber(team.shiftsFilled)} of ${plural(team.shiftsWithTarget, "shift")} fully staffed`}
        />
      )}
      <Figure label="Hours logged" value={formatNumber(team.volunteerHours)} />
      {team.shifts > 0 && (
        <Figure
          label="Not on a shift"
          value={formatNumber(team.withoutShift)}
        />
      )}
    </CardSummary>
  );
}

export function SponsorsSummary({
  sponsors,
}: {
  sponsors: {
    support_type: string;
    contribution_value: Amount;
    follow_up_status: string;
  }[];
}) {
  if (sponsors.length === 0) return null;
  const summary = computeEventSponsors(sponsors);
  const byType = SPONSOR_SUPPORT_TYPES.filter(
    (type) => summary.bySupportType[type] > 0,
  )
    .map(
      (type) =>
        `${formatNumber(summary.bySupportType[type])} ${SUPPORT_TYPE_LABELS[type]}`,
    )
    .join(", ");

  return (
    <CardSummary label="Sponsors summary">
      <Figure
        label="Sponsors"
        value={formatNumber(summary.count)}
        caption={byType}
      />
      <Figure
        label="Contributed"
        value={formatCurrency(summary.totalContributed)}
        caption="Stated contribution value"
      />
      <Figure
        label="Follow-up outstanding"
        value={formatNumber(summary.followUpOutstanding)}
        caption="Thank-you or follow-up not marked done"
      />
    </CardSummary>
  );
}

export function InKindDonationsSummary({
  items,
}: {
  items: {
    face_value: Amount;
    sponsor_id: string | null;
    donor_id: string | null;
  }[];
}) {
  if (items.length === 0) return null;
  const goods = computeEventGoods({
    in_kind_items: items,
    distributions: [],
    prizes: [],
  });
  const donors = new Set(
    items
      .filter((item) => !item.sponsor_id && item.donor_id)
      .map((item) => item.donor_id),
  ).size;

  return (
    <CardSummary label="Donations summary">
      <Figure
        label="Items received"
        value={formatNumber(goods.inKindReceived.count)}
        caption={plural(donors, "donor")}
      />
      <Figure
        label="Face value"
        value={formatCurrency(goods.inKindReceived.value)}
      />
      {goods.sponsorInKind.count > 0 && (
        <Figure
          label="From sponsors"
          value={plural(goods.sponsorInKind.count, "item")}
          caption={`${formatCurrency(goods.sponsorInKind.value)} face value, counted under Sponsors`}
        />
      )}
    </CardSummary>
  );
}

export function CashDonationsSummary({
  gifts,
}: {
  gifts: { amount: Amount; sponsor_id: string | null }[];
}) {
  if (gifts.length === 0) return null;
  const money = computeEventMoney({ ...NO_MONEY, monetary_donations: gifts });
  const stream = (key: string) =>
    money.incomeStreams.find((row) => row.key === key);
  const donations = stream(CASH_DONATIONS_STREAM);
  const sponsorships = stream(CASH_SPONSORSHIPS_STREAM);

  return (
    <CardSummary label="Cash donations summary">
      <Figure
        label="Cash donations"
        value={formatCurrency(donations?.total ?? 0)}
        caption={plural(donations?.count ?? 0, "gift")}
      />
      {sponsorships && (
        <Figure
          label="Cash sponsorships"
          value={formatCurrency(sponsorships.total)}
          caption={`${plural(sponsorships.count, "gift")}, counted under Sponsors`}
        />
      )}
    </CardSummary>
  );
}

export function DistributionsSummary({
  distributions,
}: {
  distributions: {
    quantity: number;
    recipient_person_id: string | null;
    inventory_item_id: string;
    face_value: Amount;
  }[];
}) {
  if (distributions.length === 0) return null;
  const { distributed } = computeEventGoods({
    in_kind_items: [],
    distributions,
    prizes: [],
  });

  return (
    <CardSummary label="Distributions summary">
      <Figure
        label="Distributed"
        value={formatNumber(distributed.quantity)}
        caption={plural(distributed.items, "inventory item")}
      />
      <Figure label="Recipients" value={formatNumber(distributed.recipients)} />
      <Figure
        label="Value given out"
        value={formatCurrency(distributed.value)}
        caption="Face value"
      />
    </CardSummary>
  );
}

export function ExpensesSummary({
  expenses,
  budget,
}: {
  expenses: { status: string; amount: Amount }[];
  budget: Amount;
}) {
  if (expenses.length === 0) return null;
  const money = computeEventMoney({
    ...NO_MONEY,
    budget_amount: budget,
    expenses,
  });

  return (
    <CardSummary label="Expenses summary">
      <Figure label="Paid" value={formatCurrency(money.paidSpend)} />
      <Figure
        label="Approved"
        value={formatCurrency(money.committedSpend)}
        caption="Not yet paid"
      />
      <Figure
        label="Awaiting approval"
        value={formatCurrency(money.pendingSpend)}
      />
      {money.budget !== null && (
        <Figure
          label="Budget remaining"
          value={formatCurrency(money.budgetRemaining)}
          caption={`Of ${formatCurrency(money.budget)}, after paid and approved expenses`}
        />
      )}
    </CardSummary>
  );
}
