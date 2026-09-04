import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventActiveToday, type EventWindow } from "@/lib/time";
import { getMissingCoverageSeriesForYear } from "@/app/portal/(app)/calendar/queries";
import { deriveEventPhaseTasks } from "@/app/portal/(app)/events/phase-status";
import type { EventTaskKind } from "@/app/portal/(app)/events/phase-status";
import type { EventRow } from "@/app/portal/(app)/events/event-badges";

/**
 * How loudly an attention item should ask.
 *
 * Every count used to render in the same red destructive badge, so a pending
 * expense approval, an unread contact message and a content-calendar coverage
 * reminder were indistinguishable -- and red is the token still carrying an
 * unresolved contrast finding (#436).
 */
export type AttentionSeverity =
  /** A control gap or a missed deadline: act now. */
  | "urgent"
  /** Waiting on someone, with a deadline that hasn't passed. */
  | "attention"
  /** New work in the queue, no clock on it. */
  | "info";

export type PendingApprovalItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: AttentionSeverity;
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
        severity: "attention",
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
        severity: "attention",
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
        severity: "attention",
      },
    ],
  };
}

type TodaysEventRow = EventWindow & { id: string; name: string };

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
 *
 * One item per today's event (issue #418), each deep-linking straight to
 * that event's Registrants tab -- a single item pointing at the generic
 * events list forced staff to hunt for the right event themselves, even
 * though the query already knows exactly which one(s) need attention.
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
        severity: "info",
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
        severity: "info",
      });
    }
  }

  if (options.canSeeEventCheckins) {
    const now = new Date(nowIso);
    const windowStart = new Date(now.getTime() - 86_400_000).toISOString();
    const windowEnd = new Date(now.getTime() + 86_400_000).toISOString();

    const { data: candidateEvents } = await supabase
      .from("events")
      .select("id, name, starts_at, ends_at, timezone")
      .eq("status", "published")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd);

    const todaysEvents = ((candidateEvents ?? []) as TodaysEventRow[]).filter(
      (event) => isEventActiveToday(event, now),
    );

    if (todaysEvents.length > 0) {
      const todaysEventIds = todaysEvents.map((event) => event.id);
      const { data: pendingRegistrations } = await supabase
        .from("event_registrations")
        .select("event_id")
        .in("event_id", todaysEventIds)
        .is("checked_in_at", null);

      const pendingCountByEvent = new Map<string, number>();
      for (const row of (pendingRegistrations ?? []) as {
        event_id: string;
      }[]) {
        pendingCountByEvent.set(
          row.event_id,
          (pendingCountByEvent.get(row.event_id) ?? 0) + 1,
        );
      }

      for (const event of todaysEvents) {
        const count = pendingCountByEvent.get(event.id) ?? 0;
        if (count > 0) {
          items.push({
            key: `event_checkins_pending_${event.id}`,
            label: `${count} awaiting check-in · ${event.name}`,
            count,
            href: `/portal/events/${event.id}?tab=registrants`,
            // People are standing at the door.
            severity: "urgent",
          });
        }
      }
    }
  }

  return { items };
}

/**
 * Access management alerts (issue #424): active assets whose review is due,
 * active critical-sensitivity assets without MFA enabled, and active assets
 * (medium sensitivity and up, per the requirement matrix -- "two
 * administrators" doesn't apply to low) with at most one active
 * owner/admin-level grant. Administrator-count tallying is done in JS
 * (same approach as getOpsInboxSummary's per-event check-in tally) rather
 * than a DB-side group-by -- the org's asset count is small (well under a
 * few dozen) per docs/technical-spec.md §17.4.
 */
export async function getAccessManagementAttentionSummary(
  supabase: SupabaseClient,
  options: { canSeeAccessManagement: boolean },
  nowIso: string = new Date().toISOString(),
): Promise<PendingApprovalsSummary> {
  if (!options.canSeeAccessManagement) return { items: [] };

  const items: PendingApprovalItem[] = [];
  const today = nowIso.slice(0, 10);

  const { count: reviewsDueCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("next_review", today);
  if ((reviewsDueCount ?? 0) > 0) {
    items.push({
      key: "access_management_reviews_due",
      label: `${reviewsDueCount} asset review${reviewsDueCount === 1 ? "" : "s"} due`,
      count: reviewsDueCount ?? 0,
      href: "/portal/administration/access-management?filter=reviews_due",
      severity: "attention",
    });
  }

  const { count: criticalNoMfaCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("sensitivity", "critical")
    .neq("mfa_status", "enabled");
  if ((criticalNoMfaCount ?? 0) > 0) {
    items.push({
      key: "access_management_critical_no_mfa",
      label: `${criticalNoMfaCount} critical asset${criticalNoMfaCount === 1 ? "" : "s"} without MFA enabled`,
      count: criticalNoMfaCount ?? 0,
      href: "/portal/administration/access-management?filter=critical_no_mfa",
      severity: "urgent",
    });
  }

  const { data: assetsNeedingTwoAdmins } = await supabase
    .from("assets")
    .select("id")
    .eq("status", "active")
    .neq("sensitivity", "low");
  if (assetsNeedingTwoAdmins && assetsNeedingTwoAdmins.length > 0) {
    const assetIds = assetsNeedingTwoAdmins.map((asset) => asset.id as string);
    const { data: adminGrants } = await supabase
      .from("access_grants")
      .select("asset_id")
      .eq("status", "active")
      .in("access_level", ["owner", "admin"])
      .in("asset_id", assetIds);

    const adminCountByAsset = new Map<string, number>();
    for (const grant of (adminGrants ?? []) as { asset_id: string }[]) {
      adminCountByAsset.set(
        grant.asset_id,
        (adminCountByAsset.get(grant.asset_id) ?? 0) + 1,
      );
    }

    const singleAdministratorCount = assetIds.filter(
      (assetId) => (adminCountByAsset.get(assetId) ?? 0) <= 1,
    ).length;
    if (singleAdministratorCount > 0) {
      items.push({
        key: "access_management_single_administrator",
        label: `${singleAdministratorCount} asset${singleAdministratorCount === 1 ? "" : "s"} with only one administrator`,
        count: singleAdministratorCount,
        href: "/portal/administration/access-management?filter=single_administrator",
        severity: "urgent",
      });
    }
  }

  return { items };
}

type EventTaskRow = Pick<
  EventRow,
  | "id"
  | "name"
  | "starts_at"
  | "event_lead_id"
  | "capacity"
  | "budget_amount"
  | "attendance_count"
  | "report_status"
>;

type OpenChecklistItemRow = {
  id: string;
  event_id: string;
  title: string;
  events: { name: string; starts_at: string };
};

// Defined alongside the rules that produce them, in events/phase-status.ts, so
// the dashboard and the event page's phase strip share one task vocabulary.
export type { EventTaskKind };

/**
 * One open piece of event work. Unlike `PendingApprovalItem` (a flat,
 * pre-formatted line for the portal shell's attention list), this keeps the
 * event identity separate from the task text so callers can group by event --
 * the events list sheet groups, the dashboard only counts.
 */
export type EventTaskItem = {
  key: string;
  eventId: string;
  eventName: string;
  eventStartsAt: string;
  kind: EventTaskKind;
  taskLabel: string;
  href: string;
};

export type EventTaskSummary = { items: EventTaskItem[] };

export type EventTaskGroup = {
  eventId: string;
  eventName: string;
  eventStartsAt: string;
  tasks: EventTaskItem[];
};

const TASK_KIND_ORDER: Record<EventTaskKind, number> = {
  planning: 0,
  attendance: 1,
  report: 2,
  impact: 3,
  checklist: 4,
};

/**
 * Collapses the flat task list into one group per event, oldest start date
 * first so the most overdue work sits at the top of the sheet. Within a group,
 * tasks read in event-lifecycle order regardless of which query produced them
 * (checklist items are appended after all phase tasks by `getEventTaskSummary`).
 */
export function groupEventTasksByEvent(
  items: EventTaskItem[],
): EventTaskGroup[] {
  const groups = new Map<string, EventTaskGroup>();

  for (const item of items) {
    let group = groups.get(item.eventId);
    if (!group) {
      group = {
        eventId: item.eventId,
        eventName: item.eventName,
        eventStartsAt: item.eventStartsAt,
        tasks: [],
      };
      groups.set(item.eventId, group);
    }
    group.tasks.push(item);
  }

  for (const group of groups.values()) {
    group.tasks.sort(
      (a, b) => TASK_KIND_ORDER[a.kind] - TASK_KIND_ORDER[b.kind],
    );
  }

  return [...groups.values()].sort(
    (a, b) =>
      new Date(a.eventStartsAt).getTime() - new Date(b.eventStartsAt).getTime(),
  );
}

/**
 * Backs the dashboard's "Outstanding tasks" count (home/page.tsx) and the
 * events list's Outstanding tasks sheet (events/outstanding-tasks-sheet.tsx),
 * which groups these items per event. Combines two sources of open work:
 *  - phase-derived tasks, using the same per-phase status logic that drives
 *    the event detail page's Planning/During/After badges (see
 *    events/phase-status.ts) -- an event whose phase isn't "done" yet is an
 *    open task. Scoped to draft/published events, since completed/
 *    cancelled/archived events are done by definition even if a phase was
 *    never filled in.
 *  - free-form event_checklist_items rows with is_done = false, from the
 *    event detail page's Checklist tab -- not scoped by event status, since
 *    a manually-added item (e.g. "send thank-you emails") can legitimately
 *    outlive the event itself.
 */
export async function getEventTaskSummary(
  supabase: SupabaseClient,
  options: { canManageEvents: boolean },
  nowIso: string = new Date().toISOString(),
): Promise<EventTaskSummary> {
  if (!options.canManageEvents) return { items: [] };

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, starts_at, event_lead_id, capacity, budget_amount, attendance_count, report_status",
    )
    .in("status", ["draft", "published"]);

  const now = new Date(nowIso);
  const items: EventTaskItem[] = [];

  for (const row of (events ?? []) as EventTaskRow[]) {
    // planning/during/after only read the fields selected above, so this
    // narrower row can stand in for the full EventRow they're typed against.
    const event = row as unknown as EventRow;
    const base = {
      eventId: row.id,
      eventName: row.name,
      eventStartsAt: row.starts_at,
    };

    // includeImpact is left off here: the "Impact not recorded" rule belongs on
    // the event page's phase strip, but switching it on for the dashboard would
    // add an outstanding task to every past event the day it ships.
    for (const task of deriveEventPhaseTasks(
      event,
      { hasImpactNote: false },
      now,
    )) {
      items.push({
        ...base,
        key: `event_${task.kind}_${row.id}`,
        kind: task.kind,
        taskLabel: task.taskLabel,
        href: `/portal/events/${row.id}?tab=${task.tab}`,
      });
    }
  }

  const { data: checklistItems } = await supabase
    .from("event_checklist_items")
    .select("id, event_id, title, events!inner(name, starts_at)")
    .eq("is_done", false);

  for (const row of (checklistItems ??
    []) as unknown as OpenChecklistItemRow[]) {
    items.push({
      key: `event_checklist_${row.id}`,
      eventId: row.event_id,
      eventName: row.events.name,
      eventStartsAt: row.events.starts_at,
      kind: "checklist",
      taskLabel: row.title,
      href: `/portal/events/${row.event_id}?tab=checklist`,
    });
  }

  return { items };
}
