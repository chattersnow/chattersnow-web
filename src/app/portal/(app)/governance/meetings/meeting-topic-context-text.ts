// The supporting-records blocks (#1224) as lines on a printed page, shared by
// `agenda-export.ts` and `minutes-export.ts`.
//
// A board member reading a printed agenda is the reader most likely to have no
// other way to get these numbers -- they cannot click through to the Finance
// Reports page, and they cannot re-read the ledger. So the figures print, and
// they print with the "as of" line that says when the live read happened.
//
// Kept out of `meeting-context-catalog.ts` because it reaches for the status
// labels, which live in `"use client"` form modules; the catalog is imported by
// the Server Action and must stay free of them.
import {
  contextSourcesForItem,
  isContextUnavailable,
  type ComplianceItem,
  type ContextSourceKey,
  type FinanceActivityContext,
  type MeetingTopicContext,
} from "./meeting-context-catalog";
import {
  meetingContextEntryDay,
  type MeetingDatedContext,
} from "./meeting-context-shared";
import { REQUIREMENT_STATUS_LABELS } from "../annual-requirements/annual-requirements-badges";
import type { RequirementStatus } from "../annual-requirements/annual-requirement-form";
import { GRANT_STATUS_LABELS } from "../grants/grant-form-fields";
import { PARTNERSHIP_STAGE_LABELS } from "../partnerships/partnership-opportunity-form-fields";
import { formatCalendarDate, formatCurrency } from "@/lib/format";

export type TopicContextLineStyle = {
  /** What a row is prefixed with. */
  bullet: string;
  /** What a heading or a note is prefixed with. */
  indent: string;
  strong: (text: string) => string;
};

export const TOPIC_CONTEXT_MARKDOWN: TopicContextLineStyle = {
  bullet: "- ",
  indent: "",
  strong: (text) => `**${text}**`,
};

export const TOPIC_CONTEXT_PLAIN: TopicContextLineStyle = {
  bullet: "  - ",
  indent: "  ",
  strong: (text) => text,
};

/** "due Apr 1, 2026" / "due Mar 1, 2026 (overdue)" / "no due date". */
function dueText(dueDate: string | null, overdue: boolean): string {
  if (!dueDate) return "no due date";
  return `due ${formatCalendarDate(dueDate)}${overdue ? " (overdue)" : ""}`;
}

function complianceLine(item: ComplianceItem, label: string): string {
  const detail = item.detail ? ` (${item.detail})` : "";
  return `${label}: ${item.label}${detail} — ${dueText(item.dueDate, item.overdue)}`;
}

function financeLines(
  finance: FinanceActivityContext,
  style: TopicContextLineStyle,
): string[] {
  const lines = [
    `${style.indent}${style.strong("Finance activity")} — ${formatCalendarDate(
      finance.window.fromDate,
    )} – ${formatCalendarDate(finance.window.toDate)}`,
    `${style.bullet}Income: ${formatCurrency(finance.income)}`,
    `${style.bullet}Monetary donations: ${formatCurrency(finance.cashDonations)}`,
    `${style.bullet}Paid spend: ${formatCurrency(finance.paidSpend)}`,
    `${style.bullet}Net: ${formatCurrency(finance.net)}`,
    `${style.bullet}Awaiting payment: ${formatCurrency(
      finance.approvedUnpaidSpend,
    )} approved, ${formatCurrency(finance.pendingSpend)} submitted`,
  ];
  if (finance.outstandingReimbursements) {
    const { total, count } = finance.outstandingReimbursements;
    lines.push(
      `${style.bullet}Outstanding reimbursements: ${formatCurrency(total)} across ${count}`,
    );
  }
  if (finance.upcomingEventBudget) {
    const { total, count } = finance.upcomingEventBudget;
    lines.push(
      `${style.bullet}Budgeted for upcoming events: ${formatCurrency(total)} across ${count}`,
    );
  }
  return lines;
}

/**
 * The live "Next 30 days" block, printed as dated text (#1223).
 *
 * Gaps print for the same reason they render: a board member handed a page
 * that silently omits events has no way to know it did.
 */
export function datedContextLines(
  context: MeetingDatedContext,
  style: TopicContextLineStyle,
): string[] {
  const lines = [
    `${style.indent}From the calendar and events, as of ${formatCalendarDate(context.asOf)}.`,
  ];
  if (context.entries.length === 0) {
    lines.push(`${style.bullet}Nothing scheduled.`);
  } else {
    for (const entry of context.entries) {
      const kind = entry.kind === "event" ? "Event" : "Calendar item";
      lines.push(
        `${style.bullet}${formatCalendarDate(meetingContextEntryDay(entry))} — ${entry.title} (${kind})`,
      );
    }
  }
  for (const gap of context.gaps) {
    const source = gap.source === "events" ? "Events" : "Calendar items";
    lines.push(
      `${style.indent}${
        gap.reason === "forbidden"
          ? `${source} are not included — the exporter's role does not cover them.`
          : `${source} could not be loaded.`
      }`,
    );
  }
  return lines;
}

function sourceLines(
  source: ContextSourceKey,
  context: MeetingTopicContext | undefined,
  datedContext: MeetingDatedContext | undefined,
  style: TopicContextLineStyle,
): string[] {
  if (source === "upcoming_calendar") {
    if (!datedContext) return [];
    return [
      `${style.indent}${style.strong("Next 30 days")}`,
      ...datedContextLines(datedContext, style),
    ];
  }
  if (!context) return [];

  if (source === "finance_activity") {
    const finance = context.finance_activity;
    if (isContextUnavailable(finance)) return [];
    return financeLines(finance, style);
  }

  if (source === "grants") {
    const grants = context.grants;
    if (isContextUnavailable(grants) || grants.rows.length === 0) return [];
    return [
      `${style.indent}${style.strong("Grant deadlines")}`,
      ...grants.rows.map((grant) => {
        const amount =
          grant.amount === null ? "" : ` ${formatCurrency(grant.amount)},`;
        return `${style.bullet}${grant.funderName} —${amount} ${
          GRANT_STATUS_LABELS[grant.status]
        }, ${dueText(grant.deadline, grant.overdue)}`;
      }),
      ...(grants.total > grants.rows.length
        ? [`${style.indent}${grants.total} open in total.`]
        : []),
    ];
  }

  if (source === "partnerships") {
    const partnerships = context.partnerships;
    if (isContextUnavailable(partnerships) || partnerships.rows.length === 0) {
      return [];
    }
    return [
      `${style.indent}${style.strong("Partnership opportunities")}`,
      ...partnerships.rows.map((row) => {
        const next = row.nextStepDate
          ? `, next step ${formatCalendarDate(row.nextStepDate)}`
          : "";
        return `${style.bullet}${row.organization} — ${
          PARTNERSHIP_STAGE_LABELS[row.stage]
        }${next}`;
      }),
      ...(partnerships.total > partnerships.rows.length
        ? [`${style.indent}${partnerships.total} open in total.`]
        : []),
    ];
  }

  const compliance = context.nonprofit_compliance;
  if (isContextUnavailable(compliance)) return [];
  const rows = [
    ...compliance.milestones.rows.map((item) =>
      complianceLine(item, "501(c)(3) milestone"),
    ),
    ...compliance.requirements.rows.map((item) =>
      complianceLine(
        {
          ...item,
          detail: item.detail
            ? (REQUIREMENT_STATUS_LABELS[item.detail as RequirementStatus] ??
              item.detail)
            : null,
        },
        "Annual requirement",
      ),
    ),
  ];
  if (compliance.disclosures.missing > 0) {
    rows.push(
      `Conflict-of-interest disclosures: ${compliance.disclosures.missing} of ${compliance.disclosures.boardMembers} board members have none on file for FY${compliance.disclosures.year}`,
    );
  }
  if (rows.length === 0) return [];
  return [
    `${style.indent}${style.strong("Nonprofit compliance")}`,
    ...rows.map((row) => `${style.bullet}${row}`),
  ];
}

/**
 * Every block that belongs under one agenda/minutes item, as text.
 *
 * Empty when the item maps to no source, when nothing was loaded, or when
 * every mapped source came back empty or unreadable -- an export should not
 * grow a heading with nothing under it.
 */
export function topicContextLines({
  itemKey,
  context,
  datedContext,
  style,
}: {
  itemKey: string;
  context?: MeetingTopicContext;
  datedContext?: MeetingDatedContext;
  style: TopicContextLineStyle;
}): string[] {
  const sources = contextSourcesForItem(itemKey);
  if (sources.length === 0) return [];

  const blocks = sources.flatMap((source) =>
    sourceLines(source, context, datedContext, style),
  );
  if (blocks.length === 0) return [];

  const asOf = context?.asOf ?? datedContext?.asOf;
  return [
    ...(asOf
      ? [
          `${style.indent}Supporting records, as of ${formatCalendarDate(asOf)}.`,
        ]
      : []),
    ...blocks,
  ];
}
