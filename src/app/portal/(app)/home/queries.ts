import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventActiveToday, type EventWindow } from "@/lib/time";
import { overdueStage } from "../calendar/content-opportunity-shared";
import type {
  PendingApprovalItem,
  PendingApprovalsSummary,
} from "@/lib/portal/attention-items";
import {
  computeFinanceSummary,
  type FinanceReportData,
} from "../finance/reports/summary";

export type NextEvent = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
};

export type UpcomingSummary = {
  nextEvent: NextEvent | null;
  registrationCount: number;
  volunteerCount: number;
  partnerCount: number;
};

type RegistrationRow = { party_size: number };
type LinkedEventRow = { id: string };

export async function getUpcomingSummary(
  supabase: SupabaseClient,
  nowIso: string,
): Promise<UpcomingSummary> {
  const [
    { data: nextEvents },
    { data: registrations },
    { data: volunteers },
    { data: sponsors },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, starts_at, location")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1),
    supabase
      .from("event_registrations")
      .select("party_size, events!inner(starts_at)")
      .gte("events.starts_at", nowIso),
    supabase
      .from("event_volunteers")
      .select("id, events!inner(starts_at)")
      .gte("events.starts_at", nowIso),
    supabase
      .from("event_sponsors")
      .select("id, events!inner(starts_at)")
      .gte("events.starts_at", nowIso),
  ]);

  const registrationRows = (registrations ??
    []) as unknown as RegistrationRow[];
  const volunteerRows = (volunteers ?? []) as unknown as LinkedEventRow[];
  const sponsorRows = (sponsors ?? []) as unknown as LinkedEventRow[];

  return {
    nextEvent: ((nextEvents ?? [])[0] as NextEvent | undefined) ?? null,
    registrationCount: registrationRows.reduce(
      (total, row) => total + row.party_size,
      0,
    ),
    volunteerCount: volunteerRows.length,
    partnerCount: sponsorRows.length,
  };
}

export type FinancialSummary = {
  expensesThisMonth: number;
  expensesThisYear: number;
  eventBudgetTotal: number;
  revenueThisMonth: number;
  revenueThisYear: number;
  outstandingReimbursementTotal: number;
  cashPositionTotal: number;
  incomeThisMonth: number;
  incomeThisYear: number;
};

// Stands in for "since inception" when computing the all-time cash position
// -- there's no separate ledger-start date to anchor on, and
// get_finance_report_data requires a non-null p_from.
const EARLIEST_FINANCE_DATE = "2000-01-01";

// get_finance_report_data (20260828010000) is a SECURITY DEFINER RPC gated
// on finance_reports:view, returning revenue/expenses/reimbursements/
// monetary-donations rows regardless of the caller's table-level RLS --
// exactly what board (finance_reports:view but no event_expenses/
// event_revenue/finance table access) needs to see an aggregate cash
// figure. Every role that reaches getFinancialSummary already holds
// finance_reports:view (see canSeeFinancial in home/page.tsx), so no
// separate per-widget permission check is needed here the way
// revenueThisMonth/expensesThisMonth below need canSeeRevenue/canSeeExpenses
// on the page.
async function loadFinanceReportData(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<FinanceReportData> {
  const { data, error } = await supabase.rpc("get_finance_report_data", {
    p_from: from,
    p_to: to,
  });
  const result = error ? {} : ((data ?? {}) as Partial<FinanceReportData>);
  return {
    revenue: result.revenue ?? [],
    expenses: result.expenses ?? [],
    reimbursements: result.reimbursements ?? [],
    in_kind_items: result.in_kind_items ?? [],
    monetary_donations: result.monetary_donations ?? [],
  };
}

export async function getFinancialSummary(
  supabase: SupabaseClient,
  startOfMonthDate: string,
  startOfYearDate: string,
  nowIso: string,
): Promise<FinancialSummary> {
  const todayDate = nowIso.slice(0, 10);

  const [
    { data: expensesThisYear },
    { data: expensesThisMonth },
    { data: eventBudgets },
    { data: revenueThisYear },
    { data: revenueThisMonth },
    { data: outstandingReimbursements },
    allTimeFinanceData,
    yearFinanceData,
    monthFinanceData,
  ] = await Promise.all([
    supabase
      .from("event_expenses")
      .select("amount")
      .gte("expense_date", startOfYearDate),
    supabase
      .from("event_expenses")
      .select("amount")
      .gte("expense_date", startOfMonthDate),
    supabase
      .from("events")
      .select("budget_amount")
      .eq("status", "published")
      .gte("starts_at", nowIso),
    supabase
      .from("event_revenue")
      .select("amount")
      .gte("received_date", startOfYearDate),
    supabase
      .from("event_revenue")
      .select("amount")
      .gte("received_date", startOfMonthDate),
    supabase
      .from("reimbursements")
      .select("amount")
      .in("status", ["submitted", "approved"]),
    loadFinanceReportData(supabase, EARLIEST_FINANCE_DATE, todayDate),
    loadFinanceReportData(supabase, startOfYearDate, todayDate),
    loadFinanceReportData(supabase, startOfMonthDate, todayDate),
  ]);

  const sumAmounts = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((total, row) => total + row.amount, 0);

  const eventBudgetTotal = (
    (eventBudgets ?? []) as { budget_amount: number | null }[]
  ).reduce((total, row) => total + (row.budget_amount ?? 0), 0);

  // Cash position is net of paid spend only (money that's actually left the
  // bank); monthly/yearly income is gross cash in (revenue + monetary
  // donations), matching the Finance Reports page's definitions
  // (computeFinanceSummary).
  const cashPositionSummary = computeFinanceSummary(allTimeFinanceData);
  const yearIncomeSummary = computeFinanceSummary(yearFinanceData);
  const monthIncomeSummary = computeFinanceSummary(monthFinanceData);

  return {
    expensesThisMonth: sumAmounts(expensesThisMonth),
    expensesThisYear: sumAmounts(expensesThisYear),
    eventBudgetTotal,
    revenueThisMonth: sumAmounts(revenueThisMonth),
    revenueThisYear: sumAmounts(revenueThisYear),
    outstandingReimbursementTotal: sumAmounts(outstandingReimbursements),
    cashPositionTotal: cashPositionSummary.net,
    incomeThisMonth:
      monthIncomeSummary.income + monthIncomeSummary.cashDonations,
    incomeThisYear: yearIncomeSummary.income + yearIncomeSummary.cashDonations,
  };
}

export type InventorySummary = {
  totalItems: number;
  itemsAvailable: number;
  itemsDistributed: number;
  itemsNeedingAttention: number;
};

export async function getInventorySummary(
  supabase: SupabaseClient,
): Promise<InventorySummary> {
  const [
    { count: totalItems },
    { count: itemsAvailable },
    { count: itemsDistributed },
    { count: itemsNeedingAttention },
  ] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "available"),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "distributed"),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .in("status", ["damaged", "lost"]),
  ]);

  return {
    totalItems: totalItems ?? 0,
    itemsAvailable: itemsAvailable ?? 0,
    itemsDistributed: itemsDistributed ?? 0,
    itemsNeedingAttention: itemsNeedingAttention ?? 0,
  };
}

export type ActiveEventForPerson = EventWindow & {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
};
type ActiveEventJoinRow = { events: ActiveEventForPerson };

const ACTIVE_EVENT_COLUMNS =
  "id, name, starts_at, ends_at, timezone, location, capacity";

/**
 * Events happening today or currently in progress, in each event's own
 * timezone, that the signed-in user is allowed to act on:
 *  - events the given person is signed up for via event_volunteers, plus
 *  - (when hasManagePermission is set, per #429) every active event, so a
 *    manager/admin isn't limited to events they're personally rostered on.
 * Bounded to a +/-2 day starts_at window in SQL (both branches only need
 * events:view, which every caller here has); the exact per-timezone
 * "today/in progress" check runs in JS since it can't be expressed as a
 * single SQL predicate across events in different zones.
 */
export async function getMyActiveEvents(
  supabase: SupabaseClient,
  personId: string | null,
  nowIso: string,
  hasManagePermission = false,
): Promise<ActiveEventForPerson[]> {
  const windowStart = new Date(
    new Date(nowIso).getTime() - 2 * 86_400_000,
  ).toISOString();
  const windowEnd = new Date(
    new Date(nowIso).getTime() + 2 * 86_400_000,
  ).toISOString();

  const [{ data: volunteerData }, { data: managedData }] = await Promise.all([
    personId
      ? supabase
          .from("event_volunteers")
          .select(`events!inner(${ACTIVE_EVENT_COLUMNS})`)
          .eq("person_id", personId)
          .eq("events.status", "published")
          .gte("events.starts_at", windowStart)
          .lte("events.starts_at", windowEnd)
      : Promise.resolve({ data: null }),
    hasManagePermission
      ? supabase
          .from("events")
          .select(ACTIVE_EVENT_COLUMNS)
          .eq("status", "published")
          .gte("starts_at", windowStart)
          .lte("starts_at", windowEnd)
      : Promise.resolve({ data: null }),
  ]);

  const volunteerEvents = (
    (volunteerData ?? []) as unknown as ActiveEventJoinRow[]
  ).map((row) => row.events);
  const managedEvents = (managedData ??
    []) as unknown as ActiveEventForPerson[];

  const eventsById = new Map<string, ActiveEventForPerson>();
  for (const event of [...volunteerEvents, ...managedEvents]) {
    eventsById.set(event.id, event);
  }

  const now = new Date(nowIso);
  return Array.from(eventsById.values()).filter((event) =>
    isEventActiveToday(event, now),
  );
}

export type NextGovernanceMeeting = {
  id: string;
  meeting_type: string;
  meeting_date: string;
  location: string | null;
};

export type NextGrantDeadline = {
  id: string;
  funder_name: string;
  application_deadline: string;
};

export type OrganizationSummary = {
  nextMeeting: NextGovernanceMeeting | null;
  openRequirementCount: number;
  overdueRequirementCount: number;
  openMilestoneCount: number;
  overdueMilestoneCount: number;
  openActionItemCount: number;
  overdueActionItemCount: number;
  missingDisclosureCount: number;
  disclosureYear: number;
  openPartnershipCount: number;
  nextGrantDeadline: NextGrantDeadline | null;
  overdueGrantCount: number;
};

type DueDateRow = { due_date: string | null };
type PersonIdRow = { person_id: string };
type GrantDeadlineRow = {
  id: string;
  funder_name: string;
  application_deadline: string;
};

// Statuses/stages that still count as "open" for the dashboard widgets --
// mirrors OPEN_GRANT_STATUSES in governance/grants/grant-form.ts and
// CLOSED_PARTNERSHIP_STAGES in governance/partnerships/partnership-opportunity-form.ts,
// duplicated here rather than imported to keep this dashboard query module
// free of dependencies on the portal page modules.
const OPEN_GRANT_STATUSES = ["planned", "submitted"];
const CLOSED_PARTNERSHIP_STAGES = ["closed_won", "closed_lost"];

/**
 * Organization-health rollup for the dashboard (issue #68's Organization
 * group): next scheduled governance meeting, open/overdue annual
 * requirements, nonprofit-status milestones, meeting action items, active
 * board members missing a conflict-of-interest disclosure for the current
 * year, open partnership opportunities, and the next (or overdue) grant
 * deadline (issue #498). Every backing table's select RLS is
 * governance:view, so a single section gate covers all widgets (unlike the
 * Financial section's per-widget resources).
 */
export async function getOrganizationSummary(
  supabase: SupabaseClient,
  nowIso: string,
  todayDate: string,
): Promise<OrganizationSummary> {
  const disclosureYear = Number(todayDate.slice(0, 4));

  const [
    { data: nextMeetings },
    { data: requirements },
    { data: milestones },
    { data: actionItems },
    { data: boardMembers },
    { data: disclosures },
    { count: openPartnershipCount },
    { data: openGrants },
  ] = await Promise.all([
    supabase
      .from("governance_meetings")
      .select("id, meeting_type, meeting_date, location")
      .eq("status", "scheduled")
      .gte("meeting_date", nowIso)
      .order("meeting_date", { ascending: true })
      .limit(1),
    supabase
      .from("annual_requirements")
      .select("due_date")
      .neq("status", "done"),
    supabase
      .from("nonprofit_status_milestones")
      .select("due_date")
      .not("status", "in", "(done,cancelled)"),
    supabase
      .from("governance_meeting_action_items")
      .select("due_date")
      .eq("status", "open"),
    supabase.from("board_members").select("person_id").eq("is_active", true),
    supabase
      .from("conflict_of_interest_disclosures")
      .select("person_id")
      .eq("disclosure_year", disclosureYear),
    supabase
      .from("partnership_opportunities")
      .select("id", { count: "exact", head: true })
      .not("stage", "in", `(${CLOSED_PARTNERSHIP_STAGES.join(",")})`),
    supabase
      .from("grants")
      .select("id, funder_name, application_deadline")
      .in("status", OPEN_GRANT_STATUSES)
      .order("application_deadline", { ascending: true }),
  ]);

  // due_date is a Postgres `date` (YYYY-MM-DD), so string comparison
  // against todayDate orders correctly without Date parsing.
  const countOverdue = (rows: DueDateRow[] | null) =>
    (rows ?? []).filter(
      (row) => row.due_date !== null && row.due_date < todayDate,
    ).length;

  const disclosedPersonIds = new Set(
    ((disclosures ?? []) as PersonIdRow[]).map((row) => row.person_id),
  );
  const missingDisclosurePersonIds = new Set(
    ((boardMembers ?? []) as PersonIdRow[])
      .map((row) => row.person_id)
      .filter((personId) => !disclosedPersonIds.has(personId)),
  );

  const grantRows = (openGrants ?? []) as GrantDeadlineRow[];
  const overdueGrantCount = grantRows.filter(
    (row) => row.application_deadline < todayDate,
  ).length;
  const nextGrantDeadline =
    grantRows.find((row) => row.application_deadline >= todayDate) ?? null;

  return {
    nextMeeting:
      ((nextMeetings ?? [])[0] as NextGovernanceMeeting | undefined) ?? null,
    openRequirementCount: (requirements ?? []).length,
    overdueRequirementCount: countOverdue(requirements),
    openMilestoneCount: (milestones ?? []).length,
    overdueMilestoneCount: countOverdue(milestones),
    openActionItemCount: (actionItems ?? []).length,
    overdueActionItemCount: countOverdue(actionItems),
    missingDisclosureCount: missingDisclosurePersonIds.size,
    disclosureYear,
    openPartnershipCount: openPartnershipCount ?? 0,
    nextGrantDeadline,
    overdueGrantCount,
  };
}

/**
 * "My content work", "Overdue content work", and "Tier 1 needs a decision"
 * counts for the content calendar. All three are plain RLS-scoped queries
 * (unlike getPendingApprovalsSummary's RPC): content_calendar is granted
 * consistently across roles, so RLS already returns the right rows for
 * anyone who can see the counts.
 *
 * `personId` is a public.people id: content_opportunities.owner_id/reviewer_id
 * reference people, not auth.users (20260902010000). Passing an auth id here
 * compiles fine and silently counts zero.
 */
export async function getContentWorkSummary(
  supabase: SupabaseClient,
  options: { canSeeContentCalendar: boolean; personId: string | null },
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];
  if (!options.canSeeContentCalendar || !options.personId) return { items };

  const [
    { count: myWorkCount },
    { data: openOpportunities },
    { count: tier1Count },
  ] = await Promise.all([
    supabase
      .from("content_opportunities")
      .select("id", { count: "exact", head: true })
      .neq("content_status", "published")
      .neq("content_status", "skipped")
      .or(`owner_id.eq.${options.personId},reviewer_id.eq.${options.personId}`),
    supabase
      .from("content_opportunities")
      .select("content_status, draft_due_at, review_due_at, publish_due_at")
      .neq("content_status", "published")
      .neq("content_status", "skipped"),
    supabase
      .from("calendar_items")
      .select("id", { count: "exact", head: true })
      .eq("priority_tier", 1)
      .is("decision", null)
      .neq("calendar_status", "archived"),
  ]);

  if ((myWorkCount ?? 0) > 0) {
    items.push({
      key: "content_my_work",
      label: "My content work",
      count: myWorkCount ?? 0,
      href: "/portal/calendar/work-queue?tab=my-work",
      severity: "info",
    });
  }

  const overdueCount = (openOpportunities ?? []).filter(
    (opp) => overdueStage(opp) !== null,
  ).length;
  if (overdueCount > 0) {
    items.push({
      key: "content_overdue",
      label: "Overdue content work",
      count: overdueCount,
      href: "/portal/calendar/work-queue?tab=queue&filter=overdue",
      severity: "urgent",
    });
  }

  if ((tier1Count ?? 0) > 0) {
    items.push({
      key: "content_tier1_undecided",
      label: "Tier 1 needs a decision",
      count: tier1Count ?? 0,
      href: "/portal/calendar?priority=1&decision=none",
      severity: "info",
    });
  }

  return { items };
}
