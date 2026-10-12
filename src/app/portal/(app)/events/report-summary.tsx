"use client";

import type { ReactNode } from "react";
import {
  getEventReportAction,
  type EventReportView,
} from "./report-data-actions";
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
  eventReportDrift,
  goodsHasData,
  INCIDENT_SEVERITIES,
  moneyHasData,
  SPONSOR_SUPPORT_TYPES,
  teamHasData,
  type EventReport,
  type FigureDrift,
  type IncomeStream,
} from "@/lib/portal/event-report-metrics";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useTabData } from "@/hooks/use-tab-data";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";

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

export function plural(count: number, one: string, many = `${one}s`) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export function Section({
  title,
  empty,
  emptyMessage,
  note,
  children,
}: {
  title: string;
  empty: boolean;
  emptyMessage: string;
  /** A line under the figures, e.g. how they are counted. */
  note?: ReactNode;
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
      {note && !empty && <p className="app-muted text-xs">{note}</p>}
    </section>
  );
}

/**
 * A section's figures as submitted, beside the live ones (#1579). `now` gives
 * a figure's current value when any of its `paths` (eventReportFigures keys)
 * has changed since submission, and nothing otherwise -- including on a report
 * with no snapshot, where the figures shown are already live.
 */
type SectionProps<K extends keyof EventReport> = {
  eventId: string;
  shown: NonNullable<EventReport[K]>;
  live: EventReport[K];
  drift: ReadonlyMap<string, FigureDrift>;
};

function nowValue<T>(
  { live, drift }: { live: T | null; drift: ReadonlyMap<string, FigureDrift> },
  paths: string[],
  format: (section: T) => string,
): string | undefined {
  if (!live || !paths.some((path) => drift.has(path))) return undefined;
  return format(live);
}

function MoneySection(props: SectionProps<"money">) {
  const { eventId, shown: money } = props;
  const now = (paths: string[], format: (m: typeof money) => string) =>
    nowValue(
      props,
      paths.map((path) => `money.${path}`),
      format,
    );
  const liveStream = (key: string) =>
    props.live?.incomeStreams.find((stream) => stream.key === key);
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
          now={now([`incomeStreams.${stream.key}.total`], () =>
            formatCurrency(liveStream(stream.key)?.total ?? 0),
          )}
        />
      ))}
      <Figure
        eventId={eventId}
        label="Income"
        value={formatCurrency(money.income)}
        now={now(["income"], (m) => formatCurrency(m.income))}
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
        now={now(["paidSpend"], (m) => formatCurrency(m.paidSpend))}
      />
      <Figure
        eventId={eventId}
        label="Net"
        value={formatCurrency(money.net)}
        caption="Income less paid out, as Financial Reports counts it"
        now={now(["net"], (m) => formatCurrency(m.net))}
      />
      {money.committedSpend > 0 && (
        <Figure
          eventId={eventId}
          card="expenses"
          label="Committed"
          value={formatCurrency(money.committedSpend)}
          caption="Approved but not yet paid — not in the net"
          now={now(["committedSpend"], (m) => formatCurrency(m.committedSpend))}
        />
      )}
      {money.pendingSpend > 0 && (
        <Figure
          eventId={eventId}
          card="expenses"
          label="Awaiting approval"
          value={formatCurrency(money.pendingSpend)}
          now={now(["pendingSpend"], (m) => formatCurrency(m.pendingSpend))}
        />
      )}
      {money.budget !== null && (
        <Figure
          eventId={eventId}
          card="planning"
          label="Budget remaining"
          value={formatCurrency(money.budgetRemaining)}
          caption={`Of a ${formatCurrency(money.budget)} budget, after paid and committed spend`}
          now={now(["budget", "budgetRemaining"], (m) =>
            m.budget === null
              ? "no budget"
              : `${formatCurrency(m.budgetRemaining)} of ${formatCurrency(m.budget)}`,
          )}
        />
      )}
    </Section>
  );
}

function GoodsSection(props: SectionProps<"goods">) {
  const { eventId, shown: goods } = props;
  const now = (paths: string[], format: (g: typeof goods) => string) =>
    nowValue(
      props,
      paths.map((path) => `goods.${path}`),
      format,
    );
  return (
    <Section
      title="Goods"
      empty={!goodsHasData(goods)}
      emptyMessage="No donations or prizes recorded for this event."
    >
      {goods.inKindReceived.count > 0 && (
        <Figure
          eventId={eventId}
          card="donations"
          label="In-kind donations received"
          value={plural(goods.inKindReceived.count, "item")}
          caption={`${formatCurrency(goods.inKindReceived.value)} face value`}
          now={now(["inKindReceived.count", "inKindReceived.value"], (g) =>
            itemsAndValue(g.inKindReceived),
          )}
        />
      )}
      {goods.sponsorInKind.count > 0 && (
        <Figure
          eventId={eventId}
          card="sponsors"
          label="Sponsor in-kind"
          value={plural(goods.sponsorInKind.count, "item")}
          caption={`${formatCurrency(goods.sponsorInKind.value)} face value`}
          now={now(["sponsorInKind.count", "sponsorInKind.value"], (g) =>
            itemsAndValue(g.sponsorInKind),
          )}
        />
      )}
      {goods.prizes.count > 0 && (
        <Figure
          eventId={eventId}
          card="giveaway"
          label="Prizes awarded"
          value={`${formatNumber(goods.prizes.awarded)} of ${formatNumber(goods.prizes.count)}`}
          caption={`${formatCurrency(goods.prizes.awardedValue)} estimated value awarded`}
          now={now(
            ["prizes.count", "prizes.awarded", "prizes.awardedValue"],
            (g) =>
              `${formatNumber(g.prizes.awarded)} of ${formatNumber(g.prizes.count)} (${formatCurrency(g.prizes.awardedValue)})`,
          )}
        />
      )}
    </Section>
  );
}

const itemsAndValue = ({ count, value }: { count: number; value: number }) =>
  `${plural(count, "item")} (${formatCurrency(value)})`;

function SponsorsSection(props: SectionProps<"sponsors">) {
  const { eventId, shown: sponsors } = props;
  const now = (paths: string[], format: (s: typeof sponsors) => string) =>
    nowValue(
      props,
      paths.map((path) => `sponsors.${path}`),
      format,
    );
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
        now={now(
          ["count", ...SPONSOR_SUPPORT_TYPES.map((t) => `bySupportType.${t}`)],
          (s) => formatNumber(s.count),
        )}
      />
      <Figure
        eventId={eventId}
        card="sponsors"
        label="Contributed"
        value={formatCurrency(sponsors.totalContributed)}
        caption="Stated contribution value"
        now={now(["totalContributed"], (s) =>
          formatCurrency(s.totalContributed),
        )}
      />
      <Figure
        eventId={eventId}
        card="sponsors"
        label="Follow-up outstanding"
        value={formatNumber(sponsors.followUpOutstanding)}
        caption="Thank-you or follow-up not marked done"
        now={now(["followUpOutstanding"], (s) =>
          formatNumber(s.followUpOutstanding),
        )}
      />
    </Section>
  );
}

function TeamSection(props: SectionProps<"team">) {
  const { eventId, shown: team } = props;
  const now = (paths: string[], format: (t: typeof team) => string) =>
    nowValue(
      props,
      paths.map((path) => `team.${path}`),
      format,
    );
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
        now={now(["volunteers"], (t) => formatNumber(t.volunteers))}
      />
      {team.shiftsWithTarget > 0 && (
        <Figure
          eventId={eventId}
          card="volunteers"
          label="Shift slots filled"
          value={`${formatNumber(team.shiftSlotsFilled)} of ${formatNumber(team.targetHeadcount)}`}
          caption={`${formatNumber(team.shiftsFilled)} of ${plural(team.shiftsWithTarget, "shift")} fully staffed`}
          now={now(
            [
              "shiftSlotsFilled",
              "targetHeadcount",
              "shiftsFilled",
              "shiftsWithTarget",
            ],
            (t) =>
              `${formatNumber(t.shiftSlotsFilled)} of ${formatNumber(t.targetHeadcount)}`,
          )}
        />
      )}
      <Figure
        eventId={eventId}
        card="volunteers"
        label="Volunteer hours"
        value={formatNumber(team.volunteerHours)}
        now={now(["volunteerHours"], (t) => formatNumber(t.volunteerHours))}
      />
      <Figure
        eventId={eventId}
        card="staff"
        label="Staff"
        value={formatNumber(team.staff)}
        now={now(["staff"], (t) => formatNumber(t.staff))}
      />
    </Section>
  );
}

function OperationsSection(props: SectionProps<"operations">) {
  const { eventId, shown: operations } = props;
  return (
    <Section title="Operations" empty={false} emptyMessage="">
      <Figure
        eventId={eventId}
        card="incidents"
        label="Incidents"
        value={formatNumber(operations.incidents)}
        now={nowValue(
          props,
          [
            "operations.incidents",
            ...INCIDENT_SEVERITIES.map((s) => `operations.bySeverity.${s}`),
          ],
          (o) => formatNumber(o.incidents),
        )}
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
 * The Results card's Money, Goods, Sponsors, Team and Operations sections
 * (#1576, #1588): read-only figures from the event's own records. A section
 * the reader may not see is not rendered; one with nothing recorded says so
 * rather than showing zeros. Participation and people served are Outcomes'.
 *
 * A submitted report shows the figures it was submitted with, and each one
 * that has changed since carries its current value (#1579).
 */
export function EventReportSummary({
  eventId,
  reportStatus,
}: {
  eventId: string;
  /** Refetches on submit and reopen, which add and drop the snapshot. */
  reportStatus: string;
}) {
  const { data: view, loadError } = useTabData<EventReportView>(
    () => getEventReportAction(eventId),
    [eventId, reportStatus],
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!view) {
    return (
      <p className="app-muted flex items-center gap-2 text-sm">
        <Spinner /> Loading the event summary…
      </p>
    );
  }

  const { live, snapshot } = view;
  const report = snapshot?.report ?? live;
  const drift = snapshot
    ? eventReportDrift(snapshot.report, live)
    : new Map<string, FigureDrift>();

  return (
    <div className="flex flex-col gap-6">
      {snapshot && (
        <p className="app-muted text-sm" role="note">
          Figures as submitted on {formatDateTime(snapshot.capturedAt)}.{" "}
          {drift.size > 0
            ? "Some have changed since; each shows its current value."
            : "None has changed since."}
        </p>
      )}
      {report.money && (
        <MoneySection
          eventId={eventId}
          shown={report.money}
          live={live.money}
          drift={drift}
        />
      )}
      {report.goods && (
        <GoodsSection
          eventId={eventId}
          shown={report.goods}
          live={live.goods}
          drift={drift}
        />
      )}
      {report.sponsors && (
        <SponsorsSection
          eventId={eventId}
          shown={report.sponsors}
          live={live.sponsors}
          drift={drift}
        />
      )}
      {report.team && (
        <TeamSection
          eventId={eventId}
          shown={report.team}
          live={live.team}
          drift={drift}
        />
      )}
      {report.operations && (
        <OperationsSection
          eventId={eventId}
          shown={report.operations}
          live={live.operations}
          drift={drift}
        />
      )}
    </div>
  );
}
