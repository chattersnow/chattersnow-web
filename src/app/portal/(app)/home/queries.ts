import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventActiveToday, type EventWindow } from "@/lib/time";
import { overdueStage } from "../calendar/content-opportunity-shared";
import type {
  PendingApprovalItem,
  PendingApprovalsSummary,
} from "@/lib/portal/attention-items";

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
};

export async function getFinancialSummary(
  supabase: SupabaseClient,
  startOfMonthDate: string,
  startOfYearDate: string,
  nowIso: string,
): Promise<FinancialSummary> {
  const [
    { data: expensesThisYear },
    { data: expensesThisMonth },
    { data: eventBudgets },
    { data: revenueThisYear },
    { data: revenueThisMonth },
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
  ]);

  const sumAmounts = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((total, row) => total + row.amount, 0);

  const eventBudgetTotal = (
    (eventBudgets ?? []) as { budget_amount: number | null }[]
  ).reduce((total, row) => total + (row.budget_amount ?? 0), 0);

  return {
    expensesThisMonth: sumAmounts(expensesThisMonth),
    expensesThisYear: sumAmounts(expensesThisYear),
    eventBudgetTotal,
    revenueThisMonth: sumAmounts(revenueThisMonth),
    revenueThisYear: sumAmounts(revenueThisYear),
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
};
type ActiveEventJoinRow = { events: ActiveEventForPerson };

/**
 * Events the given person is signed up for (event_volunteers) that are
 * happening today or currently in progress, in the event's own timezone.
 * Bounded to a +/-2 day starts_at window in SQL (event_volunteers/events
 * select only requires events:view, which volunteer has); the exact
 * per-timezone "today/in progress" check runs in JS since it can't be
 * expressed as a single SQL predicate across events in different zones.
 */
export async function getMyActiveEvents(
  supabase: SupabaseClient,
  personId: string,
  nowIso: string,
): Promise<ActiveEventForPerson[]> {
  const windowStart = new Date(
    new Date(nowIso).getTime() - 2 * 86_400_000,
  ).toISOString();
  const windowEnd = new Date(
    new Date(nowIso).getTime() + 2 * 86_400_000,
  ).toISOString();

  const { data } = await supabase
    .from("event_volunteers")
    .select("events!inner(id, name, starts_at, ends_at, timezone, location)")
    .eq("person_id", personId)
    .eq("events.status", "published")
    .gte("events.starts_at", windowStart)
    .lte("events.starts_at", windowEnd);

  const events = ((data ?? []) as unknown as ActiveEventJoinRow[]).map(
    (row) => row.events,
  );
  const now = new Date(nowIso);
  return events.filter((event) => isEventActiveToday(event, now));
}

/**
 * "My content work", "Overdue content work", and "Tier 1 needs a decision"
 * counts for the content calendar. All three are plain RLS-scoped queries
 * (unlike getPendingApprovalsSummary's RPC): content_calendar is granted
 * consistently across roles, so RLS already returns the right rows for
 * anyone who can see the counts.
 */
export async function getContentWorkSummary(
  supabase: SupabaseClient,
  options: { canSeeContentCalendar: boolean; userId: string | null },
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];
  if (!options.canSeeContentCalendar || !options.userId) return { items };

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
      .or(`owner_id.eq.${options.userId},reviewer_id.eq.${options.userId}`),
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
    });
  }

  if ((tier1Count ?? 0) > 0) {
    items.push({
      key: "content_tier1_undecided",
      label: "Tier 1 needs a decision",
      count: tier1Count ?? 0,
      href: "/portal/calendar?priority=1&decision=none",
    });
  }

  return { items };
}
