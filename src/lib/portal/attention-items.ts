import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventActiveToday, type EventWindow } from "@/lib/time";
import { getMissingCoverageSeriesForYear } from "@/app/portal/(app)/calendar/queries";

export type PendingApprovalItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};
export type PendingApprovalsSummary = { items: PendingApprovalItem[] };

export async function getPendingApprovalsSummary(
  supabase: SupabaseClient,
  options: {
    canSeeExpenseApprovals: boolean;
    canSeeReimbursementApprovals: boolean;
  },
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];

  if (options.canSeeExpenseApprovals) {
    const { data: pendingExpenseCount } = await supabase.rpc(
      "count_pending_event_expense_approvals",
    );
    const count = pendingExpenseCount ?? 0;
    if (count > 0) {
      items.push({
        key: "expense_approvals",
        label: "Expense approvals",
        count,
        href: "/portal/finance/expenses?status=submitted",
      });
    }
  }

  if (options.canSeeReimbursementApprovals) {
    const { data: pendingReimbursementCount } = await supabase.rpc(
      "count_pending_reimbursement_approvals",
    );
    const count = pendingReimbursementCount ?? 0;
    if (count > 0) {
      items.push({
        key: "reimbursement_approvals",
        label: "Reimbursement approvals",
        count,
        href: "/portal/finance/reimbursements?status=submitted",
      });
    }
  }

  return { items };
}

/**
 * Coverage reminder (issue #191): flags recurring Tier 1/2 observances with
 * no instance yet for next year. Gated on "manage" (not "view", unlike the
 * other summaries here) since it's an invitation to generate/import, not
 * just informational -- showing it to view-only roles would be an
 * unfixable nag. Only surfaces from October 1 (a "does next year need
 * coverage" check is noise for the other 9 months).
 */
export async function getCalendarCoverageReminderSummary(
  supabase: SupabaseClient,
  options: { canManageContentCalendar: boolean },
  now: Date = new Date(),
): Promise<PendingApprovalsSummary> {
  if (!options.canManageContentCalendar) return { items: [] };
  if (now.getUTCMonth() < 9) return { items: [] };

  const targetYear = now.getUTCFullYear() + 1;
  const missing = await getMissingCoverageSeriesForYear(supabase, targetYear);
  if (missing.length === 0) return { items: [] };

  return {
    items: [
      {
        key: "calendar_coverage_missing",
        label: `${missing.length} recurring observance${missing.length === 1 ? "" : "s"} missing for ${targetYear}`,
        count: missing.length,
        href: "/portal/calendar/import",
      },
    ],
  };
}

type TodaysEventRow = EventWindow & { id: string };

/**
 * Ops-inbox items (issue #173): new volunteer applications, new contact
 * messages, and event registrations still awaiting check-in for events
 * happening today. Unlike getPendingApprovalsSummary these are plain
 * RLS-scoped counts (same reasoning as getContentWorkSummary in
 * home/queries.ts) since volunteer_applications/contact_messages/
 * event_registrations RLS already returns the right rows per role.
 *
 * Check-ins are scoped to "today" rather than all pending registrations --
 * every future registration is pending until its event happens, so an
 * unscoped count would always be large and not actionable.
 */
export async function getOpsInboxSummary(
  supabase: SupabaseClient,
  options: {
    canSeeVolunteerApplications: boolean;
    canSeeContactMessages: boolean;
    canSeeEventCheckins: boolean;
  },
  nowIso: string = new Date().toISOString(),
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];

  if (options.canSeeVolunteerApplications) {
    const { count } = await supabase
      .from("volunteer_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    if ((count ?? 0) > 0) {
      items.push({
        key: "volunteer_applications_new",
        label: "New volunteer applications",
        count: count ?? 0,
        href: "/portal/volunteers/applications?status=new",
      });
    }
  }

  if (options.canSeeContactMessages) {
    const { count } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    if ((count ?? 0) > 0) {
      items.push({
        key: "contact_messages_new",
        label: "New messages",
        count: count ?? 0,
        href: "/portal/communications?status=new",
      });
    }
  }

  if (options.canSeeEventCheckins) {
    const now = new Date(nowIso);
    const windowStart = new Date(now.getTime() - 86_400_000).toISOString();
    const windowEnd = new Date(now.getTime() + 86_400_000).toISOString();

    const { data: candidateEvents } = await supabase
      .from("events")
      .select("id, starts_at, ends_at, timezone")
      .eq("status", "published")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd);

    const todaysEventIds = ((candidateEvents ?? []) as TodaysEventRow[])
      .filter((event) => isEventActiveToday(event, now))
      .map((event) => event.id);

    if (todaysEventIds.length > 0) {
      const { count } = await supabase
        .from("event_registrations")
        .select("id", { count: "exact", head: true })
        .in("event_id", todaysEventIds)
        .is("checked_in_at", null);
      if ((count ?? 0) > 0) {
        items.push({
          key: "event_checkins_pending",
          label: "Registrations awaiting check-in today",
          count: count ?? 0,
          href: "/portal/events",
        });
      }
    }
  }

  return { items };
}
