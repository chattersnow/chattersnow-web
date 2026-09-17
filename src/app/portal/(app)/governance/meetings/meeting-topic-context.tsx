"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { formatDueRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { REQUIREMENT_STATUS_LABELS } from "../annual-requirements/annual-requirements-badges";
import type { RequirementStatus } from "../annual-requirements/annual-requirement-form";
import { GRANT_STATUS_LABELS } from "../grants/grant-form-fields";
import { PARTNERSHIP_STAGE_LABELS } from "../partnerships/partnership-opportunity-form-fields";
import {
  CONTEXT_SOURCE_HREFS,
  contextSourcesForItem,
  isContextUnavailable,
  TOPIC_CONTEXT_ROW_LIMIT,
  type ComplianceItem,
  type ContextRows,
  type ContextSourceKey,
  type ContextUnavailable,
  type FinanceActivityContext,
  type GrantContextItem,
  type MeetingTopicContext,
  type NonprofitComplianceContext,
  type PartnershipContextItem,
} from "./meeting-context-catalog";
import type { MeetingDatedContext as MeetingDatedContextData } from "./meeting-context-shared";
import { MeetingDatedContext } from "./meeting-dated-context";

/**
 * The records that support one agenda topic, beside it (#1224).
 *
 * The adjacency is the whole point: the cash position sits under the Finance
 * item the notetaker is typing into, not in a panel two columns away, so the
 * number is beside the sentence being written about it. The quick-reference
 * aside (#1201) keeps what is cross-cutting -- who is here, what carried over
 * -- and is already at risk of becoming a kitchen sink.
 *
 * Read-only. Recording a payment or closing a requirement from here is not in
 * scope; the action item is the write, and `MinutesActionItemDialog` exists
 * for it.
 */

const UNAVAILABLE_MESSAGES: Record<
  ContextSourceKey,
  Record<ContextUnavailable["unavailable"], string>
> = {
  finance_activity: {
    forbidden:
      "Finance figures are not shown — your role does not include Finance reports.",
    error: "Finance figures could not be loaded.",
  },
  grants: {
    forbidden: "Grants are not shown — your role does not include Governance.",
    error: "Grants could not be loaded.",
  },
  nonprofit_compliance: {
    forbidden:
      "Compliance records are not shown — your role does not include Governance.",
    error: "Compliance records could not be loaded.",
  },
  partnerships: {
    forbidden:
      "Partnerships are not shown — your role does not include Governance.",
    error: "Partnerships could not be loaded.",
  },
  upcoming_calendar: {
    forbidden:
      "Scheduled dates are not shown — your role does not include the calendar.",
    error: "Scheduled dates could not be loaded.",
  },
};

function Unavailable({
  source,
  reason,
}: {
  source: ContextSourceKey;
  reason: ContextUnavailable["unavailable"];
}) {
  return (
    <p className="app-muted mt-3 text-xs">
      {UNAVAILABLE_MESSAGES[source][reason]}
    </p>
  );
}

function ContextBlock({
  title,
  href,
  total,
  shown,
  children,
}: {
  title: string;
  href: string;
  /** How many rows exist behind the ones shown; omitted for a figures block. */
  total?: number;
  shown?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
          {title}
          {total !== undefined && shown !== undefined && total > shown && (
            <span className="font-normal normal-case tracking-normal">
              {" "}
              — {shown} of {total}
            </span>
          )}
        </p>
        <Link
          href={href}
          className="shrink-0 text-xs text-[var(--purple-deep)] underline"
        >
          View all
        </Link>
      </div>
      {children}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="app-muted text-xs">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** A due date as a board reads it: the date, then how late it already is. */
function DueDate({
  dueDate,
  overdue,
}: {
  dueDate: string | null;
  overdue: boolean;
}) {
  if (!dueDate) return <span className="app-muted text-xs">No due date</span>;
  return (
    <span className={cn("app-muted text-xs", overdue && "text-destructive")}>
      {formatCalendarDate(dueDate)} · {formatDueRelative(dueDate)}
    </span>
  );
}

/** "Reimbursements owed (22)", or just the label when there are none. */
function countedLabel(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}

function FinanceBlock({ finance }: { finance: FinanceActivityContext }) {
  return (
    <ContextBlock
      title="Finance activity"
      href={CONTEXT_SOURCE_HREFS.finance_activity}
    >
      <p className="app-muted mt-1 text-xs">
        Since the previous meeting:{" "}
        {formatCalendarDate(finance.window.fromDate)} –{" "}
        {formatCalendarDate(finance.window.toDate)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Figure label="Income" value={formatCurrency(finance.income)} />
        <Figure
          label="Donations"
          value={formatCurrency(finance.cashDonations)}
        />
        <Figure label="Paid spend" value={formatCurrency(finance.paidSpend)} />
        <Figure label="Net" value={formatCurrency(finance.net)} />
        <Figure
          label="Approved, unpaid"
          value={formatCurrency(finance.approvedUnpaidSpend)}
        />
        <Figure
          label="Submitted, pending"
          value={formatCurrency(finance.pendingSpend)}
        />
        {/* Rendered whenever the caller may read the source, zero included:
            a missing figure means "your role does not cover this", and
            "nothing outstanding" has to stay distinguishable from it. */}
        {finance.outstandingReimbursements && (
          <Figure
            label={countedLabel(
              "Reimbursements owed",
              finance.outstandingReimbursements.count,
            )}
            value={formatCurrency(finance.outstandingReimbursements.total)}
          />
        )}
        {finance.upcomingEventBudget && (
          <Figure
            label={countedLabel(
              "Upcoming event budgets",
              finance.upcomingEventBudget.count,
            )}
            value={formatCurrency(finance.upcomingEventBudget.total)}
          />
        )}
      </dl>
    </ContextBlock>
  );
}

function ComplianceRows({
  title,
  href,
  items,
  total,
  requirementStatus,
}: {
  title: string;
  href: string;
  items: ComplianceItem[];
  total: number;
  /** Requirement rows carry a status in `detail`; milestone rows carry a phase. */
  requirementStatus?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ContextBlock title={title} href={href} total={total} shown={items.length}>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0">{item.label}</span>
            {item.detail && (
              <span className="app-muted text-xs">
                {requirementStatus
                  ? (REQUIREMENT_STATUS_LABELS[
                      item.detail as RequirementStatus
                    ] ?? item.detail)
                  : item.detail}
              </span>
            )}
            <DueDate dueDate={item.dueDate} overdue={item.overdue} />
          </li>
        ))}
      </ul>
    </ContextBlock>
  );
}

function ComplianceBlock({
  compliance,
}: {
  compliance: NonprofitComplianceContext;
}) {
  const { milestones, requirements, disclosures } = compliance;
  const nothing =
    milestones.rows.length === 0 &&
    requirements.rows.length === 0 &&
    disclosures.missing === 0;
  if (nothing) return null;

  return (
    <>
      <ComplianceRows
        title="501(c)(3) milestones"
        href={CONTEXT_SOURCE_HREFS.milestones}
        items={milestones.rows}
        total={milestones.total}
      />
      <ComplianceRows
        title="Annual requirements"
        href={CONTEXT_SOURCE_HREFS.requirements}
        items={requirements.rows}
        total={requirements.total}
        requirementStatus
      />
      {disclosures.missing > 0 && (
        <ContextBlock
          title="Conflict of interest"
          href={CONTEXT_SOURCE_HREFS.disclosures}
        >
          <p className="mt-1 text-sm">
            {disclosures.missing} of {disclosures.boardMembers} active board
            members have no disclosure on file for FY{disclosures.year}.
          </p>
        </ContextBlock>
      )}
    </>
  );
}

function GrantsBlock({ grants }: { grants: ContextRows<GrantContextItem> }) {
  if (grants.rows.length === 0) return null;
  return (
    <ContextBlock
      title="Grant deadlines"
      href={CONTEXT_SOURCE_HREFS.grants}
      total={grants.total}
      shown={grants.rows.length}
    >
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {grants.rows.map((grant) => (
          <li key={grant.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0">{grant.funderName}</span>
            {grant.amount !== null && (
              <span className="app-muted text-xs tabular-nums">
                {formatCurrency(grant.amount)}
              </span>
            )}
            <span className="app-muted text-xs">
              {GRANT_STATUS_LABELS[grant.status]}
            </span>
            <DueDate dueDate={grant.deadline} overdue={grant.overdue} />
          </li>
        ))}
      </ul>
    </ContextBlock>
  );
}

function PartnershipsBlock({
  partnerships,
}: {
  partnerships: ContextRows<PartnershipContextItem>;
}) {
  if (partnerships.rows.length === 0) return null;
  return (
    <ContextBlock
      title="Partnership opportunities"
      href={CONTEXT_SOURCE_HREFS.partnerships}
      total={partnerships.total}
      shown={partnerships.rows.length}
    >
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {partnerships.rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-0">{row.organization}</span>
            <span className="app-muted text-xs">
              {PARTNERSHIP_STAGE_LABELS[row.stage]}
            </span>
            {row.nextStepDate && (
              <span className="app-muted text-xs">
                Next step {formatCalendarDate(row.nextStepDate)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </ContextBlock>
  );
}

function SourceBlock({
  source,
  context,
  datedContext,
}: {
  source: ContextSourceKey;
  context: MeetingTopicContext | undefined;
  datedContext: MeetingDatedContextData | undefined;
}) {
  if (source === "upcoming_calendar") {
    // Only where there is no standalone "Next 30 days" block already on the
    // page -- the agenda has one, and passes nothing here.
    if (!datedContext) return null;
    return (
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <MeetingDatedContext
          context={datedContext}
          loadError={null}
          maxEntries={TOPIC_CONTEXT_ROW_LIMIT}
        />
      </div>
    );
  }
  if (!context) return null;

  // Each branch indexes the field by name rather than through `context[source]`:
  // the payload types differ per source, and a computed index would widen them
  // all back into one union.
  if (source === "finance_activity") {
    const finance = context.finance_activity;
    return isContextUnavailable(finance) ? (
      <Unavailable source={source} reason={finance.unavailable} />
    ) : (
      <FinanceBlock finance={finance} />
    );
  }
  if (source === "grants") {
    const grants = context.grants;
    return isContextUnavailable(grants) ? (
      <Unavailable source={source} reason={grants.unavailable} />
    ) : (
      <GrantsBlock grants={grants} />
    );
  }
  if (source === "partnerships") {
    const partnerships = context.partnerships;
    return isContextUnavailable(partnerships) ? (
      <Unavailable source={source} reason={partnerships.unavailable} />
    ) : (
      <PartnershipsBlock partnerships={partnerships} />
    );
  }
  const compliance = context.nonprofit_compliance;
  return isContextUnavailable(compliance) ? (
    <Unavailable source={source} reason={compliance.unavailable} />
  ) : (
    <ComplianceBlock compliance={compliance} />
  );
}

export function TopicContext({
  itemKey,
  context,
  datedContext,
}: {
  /** The qualified item key, e.g. `section:finance_fundraising`. */
  itemKey: string;
  /** `undefined` while the read is in flight. */
  context: MeetingTopicContext | undefined;
  /** #1223's calendar block, for the Events section. Omitted on the agenda. */
  datedContext?: MeetingDatedContextData;
}) {
  const sources = contextSourcesForItem(itemKey);
  if (sources.length === 0) return null;

  // Only the calendar-only sections can render from `datedContext` alone.
  if (
    context === undefined &&
    !(sources.length === 1 && sources[0] === "upcoming_calendar")
  ) {
    return <Skeleton className="mt-3 h-12 w-full" />;
  }

  return (
    <>
      {sources.map((source) => (
        <SourceBlock
          key={source}
          source={source}
          context={context}
          datedContext={datedContext}
        />
      ))}
    </>
  );
}
