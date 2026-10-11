"use client";

import type { ReactNode } from "react";
import { getEventReportAction } from "./report-data-actions";
import type { TabValue } from "./event-tabs-config";
import { Figure } from "./summary-figures";
import {
  isRevenueSource,
  revenueSourceLabel,
} from "../finance/revenue/revenue-shared";
import {
  GIVEAWAY_TICKETS_SOURCE,
  MERCHANDISE_SOURCE,
} from "../finance/reports/summary";
import {
  CASH_DONATIONS_STREAM,
  CASH_SPONSORSHIPS_STREAM,
  goodsHasData,
  INCIDENT_SEVERITIES,
  moneyHasData,
  SPONSOR_SUPPORT_TYPES,
  teamHasData,
  type EventReport,
  type IncomeStream,
} from "@/lib/portal/event-report-metrics";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useTabData } from "@/hooks/use-tab-data";
import { formatCurrency, formatNumber } from "@/lib/format";

const STREAM_LABELS: Record<string, string> = {
  [MERCHANDISE_SOURCE]: "Sales",
  [GIVEAWAY_TICKETS_SOURCE]: "Giveaway tickets",
  [CASH_DONATIONS_STREAM]: "Cash donations",
  [CASH_SPONSORSHIPS_STREAM]: "Cash sponsorships",
};

// Where each income stream's rows live.
const STREAM_CARDS: Record<string, TabValue | undefined> = {
  [MERCHANDISE_SOURCE]: "sales",
  [CASH_DONATIONS_STREAM]: "cash-donations",
  [GIVEAWAY_TICKETS_SOURCE]: "giveaway",
  [CASH_SPONSORSHIPS_STREAM]: "sponsors",
};

function streamLabel(key: string) {
  if (STREAM_LABELS[key]) return STREAM_LABELS[key];
  return isRevenueSource(key) ? revenueSourceLabel(key) : key;
}

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  cash: "cash",
  in_kind: "in kind",
  both: "cash and in kind",
  other: "other",
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function Section({
  title,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h4 className="text-sm font-semibold">{title}</h4>
      {empty ? (
        <p className="app-muted text-sm">{emptyMessage}</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
      )}
    </section>
  );
}

function MoneySection({
  eventId,
  money,
}: {
  eventId: string;
  money: NonNullable<EventReport["money"]>;
}) {
  return (
    <Section
      title="Money"
      empty={!moneyHasData(money)}
      emptyMessage="No income, expenses or budget recorded for this event."
    >
      {money.incomeStreams.map((stream: IncomeStream) => (
        <Figure
          key={stream.key}
          eventId={eventId}
          card={
            STREAM_CARDS[stream.key] ??
            (isRevenueSource(stream.key) ? "revenue" : undefined)
          }
          label={streamLabel(stream.key)}
          value={formatCurrency(stream.total)}
          caption={plural(stream.count, "record")}
        />
      ))}
      <Figure
        eventId={eventId}
        label="Income"
        value={formatCurrency(money.income)}
        caption={
          money.salesTax > 0
            ? `Excludes ${formatCurrency(money.salesTax)} sales tax collected`
            : undefined
        }
      />
      <Figure
        eventId={eventId}
        card="expenses"
        label="Paid out"
        value={formatCurrency(money.paidSpend)}
        caption="Expenses and reimbursements marked paid"
      />
      <Figure
        eventId={eventId}
        label="Net"
        value={formatCurrency(money.net)}
        caption="Income less paid out, as Financial Reports counts it"
      />
      {money.committedSpend > 0 && (
        <Figure
          eventId={eventId}
          card="expenses"
          label="Committed"
          value={formatCurrency(money.committedSpend)}
          caption="Approved but not yet paid — not in the net"
        />
      )}
      {money.pendingSpend > 0 && (
        <Figure
          eventId={eventId}
          card="expenses"
          label="Awaiting approval"
          value={formatCurrency(money.pendingSpend)}
        />
      )}
      {money.budget !== null && (
        <Figure
          eventId={eventId}
          card="planning"
          label="Budget remaining"
          value={formatCurrency(money.budgetRemaining)}
          caption={`Of a ${formatCurrency(money.budget)} budget, after paid and committed spend`}
        />
      )}
    </Section>
  );
}

function GoodsSection({
  eventId,
  goods,
}: {
  eventId: string;
  goods: NonNullable<EventReport["goods"]>;
}) {
  return (
    <Section
      title="Goods"
      empty={!goodsHasData(goods)}
      emptyMessage="No donations, distributions or prizes recorded for this event."
    >
      {goods.inKindReceived.count > 0 && (
        <Figure
          eventId={eventId}
          card="donations"
          label="In-kind donations received"
          value={plural(goods.inKindReceived.count, "item")}
          caption={`${formatCurrency(goods.inKindReceived.value)} face value`}
        />
      )}
      {goods.sponsorInKind.count > 0 && (
        <Figure
          eventId={eventId}
          card="sponsors"
          label="Sponsor in-kind"
          value={plural(goods.sponsorInKind.count, "item")}
          caption={`${formatCurrency(goods.sponsorInKind.value)} face value`}
        />
      )}
      {goods.distributed.quantity > 0 && (
        <Figure
          eventId={eventId}
          card="distributions"
          label="Distributed"
          value={plural(goods.distributed.quantity, "item")}
          caption={`${plural(goods.distributed.recipients, "recipient")} · ${formatCurrency(goods.distributed.value)} face value`}
        />
      )}
      {goods.prizes.count > 0 && (
        <Figure
          eventId={eventId}
          card="giveaway"
          label="Prizes awarded"
          value={`${formatNumber(goods.prizes.awarded)} of ${formatNumber(goods.prizes.count)}`}
          caption={`${formatCurrency(goods.prizes.awardedValue)} estimated value awarded`}
        />
      )}
    </Section>
  );
}

function SponsorsSection({
  eventId,
  sponsors,
}: {
  eventId: string;
  sponsors: NonNullable<EventReport["sponsors"]>;
}) {
  const byType = SPONSOR_SUPPORT_TYPES.filter(
    (type) => sponsors.bySupportType[type] > 0,
  )
    .map(
      (type) =>
        `${formatNumber(sponsors.bySupportType[type])} ${SUPPORT_TYPE_LABELS[type]}`,
    )
    .join(", ");

  return (
    <Section
      title="Sponsors"
      empty={sponsors.count === 0}
      emptyMessage="No sponsors recorded for this event."
    >
      <Figure
        eventId={eventId}
        card="sponsors"
        label="Sponsors"
        value={formatNumber(sponsors.count)}
        caption={byType}
      />
      <Figure
        eventId={eventId}
        card="sponsors"
        label="Contributed"
        value={formatCurrency(sponsors.totalContributed)}
        caption="Stated contribution value"
      />
      <Figure
        eventId={eventId}
        card="sponsors"
        label="Follow-up outstanding"
        value={formatNumber(sponsors.followUpOutstanding)}
        caption="Thank-you or follow-up not marked done"
      />
    </Section>
  );
}

function TeamSection({
  eventId,
  team,
}: {
  eventId: string;
  team: NonNullable<EventReport["team"]>;
}) {
  return (
    <Section
      title="Team"
      empty={!teamHasData(team)}
      emptyMessage="No volunteers, staff or shifts recorded for this event."
    >
      <Figure
        eventId={eventId}
        card="volunteers"
        label="Volunteers"
        value={formatNumber(team.volunteers)}
      />
      {team.shiftsWithTarget > 0 && (
        <Figure
          eventId={eventId}
          card="volunteers"
          label="Shift slots filled"
          value={`${formatNumber(team.shiftSlotsFilled)} of ${formatNumber(team.targetHeadcount)}`}
          caption={`${formatNumber(team.shiftsFilled)} of ${plural(team.shiftsWithTarget, "shift")} fully staffed`}
        />
      )}
      <Figure
        eventId={eventId}
        card="volunteers"
        label="Volunteer hours"
        value={formatNumber(team.volunteerHours)}
      />
      <Figure
        eventId={eventId}
        card="staff"
        label="Staff"
        value={formatNumber(team.staff)}
      />
    </Section>
  );
}

function GuestsSection({
  eventId,
  guests,
}: {
  eventId: string;
  guests: EventImpactDerived;
}) {
  return (
    <Section
      title="Guests"
      empty={guests.participants === 0 && guests.checkedIn === 0}
      emptyMessage="No attendance recorded for this event."
    >
      <Figure
        eventId={eventId}
        card="attendance"
        label="Participants"
        value={formatNumber(guests.participants)}
        caption="Headcount from the Attendance card"
      />
      <Figure
        eventId={eventId}
        card="registrants"
        label="Checked in"
        value={formatNumber(guests.checkedIn)}
      />
      <Figure
        eventId={eventId}
        card="impact"
        label="First-time participants"
        value={formatNumber(guests.firstTimeParticipants)}
      />
    </Section>
  );
}

function OperationsSection({
  eventId,
  operations,
}: {
  eventId: string;
  operations: NonNullable<EventReport["operations"]>;
}) {
  return (
    <Section title="Operations" empty={false} emptyMessage="">
      <Figure
        eventId={eventId}
        card="incidents"
        label="Incidents"
        value={formatNumber(operations.incidents)}
        caption={
          operations.incidents > 0
            ? INCIDENT_SEVERITIES.filter(
                (severity) => operations.bySeverity[severity] > 0,
              )
                .map(
                  (severity) =>
                    `${formatNumber(operations.bySeverity[severity])} ${severity}`,
                )
                .join(", ")
            : "None reported"
        }
      />
    </Section>
  );
}

/**
 * The Report card's computed summary (#1576): read-only figures from the
 * event's own records, in place of the typed `report_summary`. A section the
 * reader may not see is not rendered; one with nothing recorded says so
 * rather than showing zeros.
 */
export function EventReportSummary({
  eventId,
  guests,
}: {
  eventId: string;
  guests: EventImpactDerived | undefined;
}) {
  const { data: report, loadError } = useTabData<EventReport>(
    () => getEventReportAction(eventId),
    [eventId],
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!report) {
    return (
      <p className="app-muted flex items-center gap-2 text-sm">
        <Spinner /> Loading the event summary…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {report.money && <MoneySection eventId={eventId} money={report.money} />}
      {report.goods && <GoodsSection eventId={eventId} goods={report.goods} />}
      {report.sponsors && (
        <SponsorsSection eventId={eventId} sponsors={report.sponsors} />
      )}
      {report.team && <TeamSection eventId={eventId} team={report.team} />}
      {guests && <GuestsSection eventId={eventId} guests={guests} />}
      {report.operations && (
        <OperationsSection eventId={eventId} operations={report.operations} />
      )}
    </div>
  );
}
