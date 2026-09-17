// Which portal records support which agenda section, and the shapes they come
// back in (#1224).
//
// Pure, and deliberately free of both Next and `@/lib/format`: the Server
// Action that reads these sources imports it, the client block that renders
// them imports it, and the export's text builder imports it. A module any of
// those three could not import would end up copied into the other two.
//
// **Keyed on the seeded section keys, in code.** `agenda_template_versions.sections`
// is tenant-owned data and there is no template-editing UI, so a tenant that
// renames `finance_fundraising` simply gets no context block under it -- not an
// error, and not an empty box. Putting a `data_sources` array on the section
// rows is the right long-run answer and waits for template editing to exist.
import type { GrantStatus } from "../grants/grant-form";
import type { PartnershipStage } from "../partnerships/partnership-opportunity-form";

export type ContextSourceKey =
  | "finance_activity"
  | "grants"
  | "nonprofit_compliance"
  | "partnerships"
  | "upcoming_calendar";

/**
 * Section key -> the sources that belong under it.
 *
 * `marketing_social`, `operations` and `technology_website` are deliberately
 * absent: `getContentWorkSummary` and `getInventorySummary` would fit, but the
 * value is thin against a board's attention.
 */
export const SECTION_CONTEXT_SOURCES: Record<string, ContextSourceKey[]> = {
  finance_fundraising: ["finance_activity", "grants"],
  legal_nonprofit: ["nonprofit_compliance"],
  events: ["upcoming_calendar"],
  community_partnerships: ["partnerships"],
};

const SECTION_PREFIX = "section:";

/** How many rows a block shows before it defers to "View all". */
export const TOPIC_CONTEXT_ROW_LIMIT = 3;

/**
 * The sources for one agenda/minutes item, from its key.
 *
 * Takes the qualified key (`section:finance_fundraising`) rather than the bare
 * section key, because the minutes snapshot is where most callers read it from
 * and re-deriving the prefix in two places is how the two lists drift. Anything
 * that is not a section -- `opening`, `new_business:0` -- has no sources.
 */
export function contextSourcesForItem(itemKey: string): ContextSourceKey[] {
  if (!itemKey.startsWith(SECTION_PREFIX)) return [];
  return SECTION_CONTEXT_SOURCES[itemKey.slice(SECTION_PREFIX.length)] ?? [];
}

/**
 * A source the caller could not read.
 *
 * Never merged into an empty payload: "no open filings" and "you cannot see
 * the filings" must not render identically, which is the same reason #1223's
 * dated context carries `gaps` beside its entries rather than inside them.
 */
export type ContextUnavailable = { unavailable: "forbidden" | "error" };

export function isContextUnavailable<T extends object>(
  value: T | ContextUnavailable,
): value is ContextUnavailable {
  return "unavailable" in value;
}

/** A window as a block labels it: two inclusive days in the org's zone. */
export type ContextWindow = { fromDate: string; toDate: string };

/**
 * What came in and went out since the board last met, plus what is already
 * committed ahead of it. Aggregates and counts only -- a board packet is not
 * the place for donor-level rows, and the people entitled to those already
 * have the Donations page.
 */
export type FinanceActivityContext = {
  /** The review window: the previous meeting's day through this one's. */
  window: ContextWindow;
  /** Gross cash in from trading over the window: event revenue plus sales. */
  income: number;
  cashDonations: number;
  paidSpend: number;
  /** `income + cashDonations - paidSpend`, as the Finance Reports page defines it. */
  net: number;
  approvedUnpaidSpend: number;
  pendingSpend: number;
  /**
   * Reimbursements still `submitted` or `approved` at any date -- money the
   * organization owes, which is not a window figure. `null` when the caller's
   * role covers neither reimbursements nor their approval.
   */
  outstandingReimbursements: { total: number; count: number } | null;
  /**
   * Published events starting inside the lookahead window that carry a budget.
   * `null` when the caller's role does not include Events: a zero here and
   * "you cannot see the events" are not the same statement.
   */
  upcomingEventBudget: { total: number; count: number } | null;
};

/** An open obligation, in the one shape both compliance lists share. */
export type ComplianceItem = {
  id: string;
  label: string;
  /** The milestone's phase, or the requirement's status. */
  detail: string | null;
  /**
   * Null only for a milestone: `nonprofit_status_milestones.due_date` is
   * nullable and most rows leave it blank, so a list that required one would
   * be permanently empty under the very heading that asks where the 501(c)(3)
   * application stands. `annual_requirements.due_date` is not null.
   */
  dueDate: string | null;
  overdue: boolean;
};

/** Rows to show, and how many there are in total behind "View all". */
export type ContextRows<T> = { rows: T[]; total: number };

export type NonprofitComplianceContext = {
  milestones: ContextRows<ComplianceItem>;
  requirements: ContextRows<ComplianceItem>;
  /**
   * Active board members with no conflict-of-interest disclosure on file.
   * `year` is the **fiscal** year the meeting falls in, because
   * `conflict_of_interest_disclosures.disclosure_year` names the fiscal year
   * the disclosure covers, not the calendar one.
   */
  disclosures: { year: number; missing: number; boardMembers: number };
};

export type GrantContextItem = {
  id: string;
  funderName: string;
  amount: number | null;
  deadline: string;
  status: GrantStatus;
  overdue: boolean;
};

export type PartnershipContextItem = {
  id: string;
  organization: string;
  stage: PartnershipStage;
  nextStepDate: string | null;
};

/**
 * Everything the sources answered, in one object.
 *
 * `upcoming_calendar` is absent on purpose. It is #1223's
 * `listMeetingDatedContextAction`, which the Agenda tab already loads for its
 * "Next 30 days" block; re-reading it here would mean two identical queries on
 * the one page that shows both. Callers pass that context alongside this one.
 */
export type MeetingTopicContext = {
  /** The organization's zone, which is where both windows were cut. */
  timeZone: string;
  /** The day this was read, in the organization's zone, for the export's "as of". */
  asOf: string;
  review: ContextWindow;
  lookahead: ContextWindow;
  finance_activity: FinanceActivityContext | ContextUnavailable;
  grants: ContextRows<GrantContextItem> | ContextUnavailable;
  nonprofit_compliance: NonprofitComplianceContext | ContextUnavailable;
  partnerships: ContextRows<PartnershipContextItem> | ContextUnavailable;
};

/** Where each block's "View all" goes. */
export const CONTEXT_SOURCE_HREFS = {
  finance_activity: "/portal/finance/reports",
  grants: "/portal/governance/grants",
  milestones: "/portal/governance/nonprofit-status",
  requirements: "/portal/governance/annual-requirements",
  disclosures: "/portal/governance/conflict-of-interest",
  partnerships: "/portal/governance/partnerships",
} as const;
