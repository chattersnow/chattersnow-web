"use server";

// The dated records a meeting should have in front of it (#1223).
//
// Read live and never copied: the agenda's "Next 30 days" block queries this on
// render, so a rescheduled event is right the next time anybody opens the
// agenda. Only a date somebody *pins* is written into `agendas.upcoming_dates`,
// and that copy is what survives into the frozen minutes snapshot and the
// printed export.
//
// Two sources under two different permissions, which is the whole reason this
// returns what it returns. The meeting association is `governance:view`; events
// are `events:view` and calendar items are `content_calendar:view`, each read
// under the caller's own RLS. A source the caller cannot see comes back absent
// with a reason rather than as an empty list -- the `board` role holds
// governance at manage and events at none, so "nothing is scheduled" and "you
// cannot see what is scheduled" are the two things a board member would most
// easily confuse.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasAnyPermission,
  hasPermission,
  type PermissionMap,
} from "@/lib/auth/permissions";
import {
  actionError,
  fromGuard,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { fiscalYearForDate, getFiscalYearStartMonth } from "@/lib/fiscal-year";
import { personDisplayName } from "@/lib/format";
import { todayInZone, utcDateFromIsoDay } from "@/lib/time";
import {
  computeFinanceSummary,
  type FinanceReportData,
} from "../../finance/reports/summary";
import { OPEN_GRANT_STATUSES, type GrantStatus } from "../grants/grant-form";
import {
  CLOSED_PARTNERSHIP_STAGES,
  type PartnershipStage,
} from "../partnerships/partnership-opportunity-form";
import {
  calendarItemEntry,
  eventEntry,
  sortCalendarEntries,
} from "../../calendar/calendar-entries";
import { hasStructuredRecurrence } from "../../calendar/calendar-recurrence";
import { listCalendarEvents } from "../../calendar/queries";
import {
  TOPIC_CONTEXT_ROW_LIMIT,
  type ContextRows,
  type ContextUnavailable,
  type FinanceActivityContext,
  type GrantContextItem,
  type MeetingTopicContext,
  type NonprofitComplianceContext,
  type PartnershipContextItem,
} from "./meeting-context-catalog";
import {
  resolveMeetingWindows,
  type MeetingWindows,
} from "./meeting-context-window";
import { findPreviousMeeting } from "./previous-meeting";
import {
  MEETING_CALENDAR_ITEM_SELECT,
  nextInstanceInWindow,
  type MeetingCalendarItemRow,
  type MeetingContextEntry,
  type MeetingContextGap,
  type MeetingDatedContext,
} from "./meeting-context-shared";

export async function listMeetingDatedContextAction(
  meetingId: string,
): Promise<{ data: MeetingDatedContext } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "governance", "view");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const [meetingResult, timeZone, permissions] = await Promise.all([
    supabase
      .from("governance_meetings")
      .select("id, meeting_date")
      .eq("id", meetingId)
      .maybeSingle(),
    getOrgTimeZone(supabase),
    getCurrentUserPermissions(supabase),
  ]);

  if (meetingResult.error) {
    return actionError(
      "server_error",
      "Could not load the dates around this meeting. Please try again.",
    );
  }
  if (!meetingResult.data) {
    return actionError("conflict", "That meeting no longer exists.");
  }

  const { lookahead } = resolveMeetingWindows({
    meetingDate: meetingResult.data.meeting_date as string,
    timeZone,
  });

  const canReadEvents = hasPermission(permissions, "events", "view");
  const canReadCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );

  const [events, calendarItems, recurringCandidates] = await Promise.all([
    canReadEvents
      ? listCalendarEvents(supabase, {
          window: {
            fromInstant: lookahead.fromInstant,
            toInstant: lookahead.toInstant,
          },
        })
      : null,
    canReadCalendar
      ? supabase
          .from("calendar_items")
          .select(MEETING_CALENDAR_ITEM_SELECT)
          .neq("calendar_status", "archived")
          .gte("starts_at", lookahead.fromInstant)
          .lte("starts_at", lookahead.toInstant)
      : null,
    // Every live series, whatever year its anchor row is dated in -- the window
    // filter above cannot see a 2024 row that recurs this March. Bounded by
    // how few structured-recurrence rows exist (they are the Tier 1/2
    // observances the coverage reminder already walks), not by a range.
    canReadCalendar
      ? supabase
          .from("calendar_items")
          .select(MEETING_CALENDAR_ITEM_SELECT)
          .neq("calendar_status", "archived")
          .not("series_key", "is", null)
      : null,
  ]);

  const gaps: MeetingContextGap[] = [];
  const entries: MeetingContextEntry[] = [];

  if (!canReadEvents) {
    gaps.push({ source: "events", reason: "forbidden" });
  } else if (events?.error) {
    gaps.push({ source: "events", reason: "error" });
  } else {
    entries.push(...(events?.events ?? []).map(eventEntry));
  }

  if (!canReadCalendar) {
    gaps.push({ source: "calendar_items", reason: "forbidden" });
  } else if (calendarItems?.error || recurringCandidates?.error) {
    gaps.push({ source: "calendar_items", reason: "error" });
  } else {
    const dated = (calendarItems?.data ?? []) as MeetingCalendarItemRow[];
    const datedIds = new Set(dated.map((item) => item.id));
    entries.push(...dated.map(calendarItemEntry));

    for (const item of (recurringCandidates?.data ??
      []) as MeetingCalendarItemRow[]) {
      if (datedIds.has(item.id)) continue;
      if (!hasStructuredRecurrence(item)) continue;
      const instance = nextInstanceInWindow(item, lookahead);
      if (!instance) continue;
      // Labelled with the instance's date; `item` stays the anchor row it was
      // read from, which is the record the href opens.
      entries.push({
        ...calendarItemEntry(item),
        starts_at: instance.startsAt,
        ends_at: instance.endsAt,
      });
    }
  }

  return {
    data: {
      timeZone,
      asOf: todayInZone(timeZone),
      window: { fromDate: lookahead.fromDate, toDate: lookahead.toDate },
      // Soonest first, through the calendar's own comparator: the two sources
      // arrive separately and a projected recurrence carries a date its query
      // never ordered on.
      entries: sortCalendarEntries(entries, "starts_at", "asc"),
      gaps,
    },
  };
}

// ---------------------------------------------------------------------------
// The records behind each standing agenda section (#1224).
//
// **One action, not one read per block per item.** The mapping in
// `meeting-context-catalog.ts` puts up to two sources under a section, and a
// board agenda has seven of them; a `useTabData` per block per item would be a
// page that fetches forty times to show a reference list. Everything below
// goes out in one `Promise.all` and comes back as one object.
//
// Nothing here is written into `agenda_snapshot`. The snapshot freezes the
// *plan* so structure cannot move under a notetaker mid-sentence; these
// figures are a live read, and what gets typed into the note is the record.
// Copying a cash position into the snapshot would create a second, silent,
// un-auditable financial statement.
// ---------------------------------------------------------------------------

const UNAVAILABLE_FORBIDDEN: ContextUnavailable = { unavailable: "forbidden" };
const UNAVAILABLE_ERROR: ContextUnavailable = { unavailable: "error" };

type AmountRow = { amount: number | null };
type BudgetRow = { budget_amount: number | null };
type MilestoneRow = {
  id: string;
  description: string;
  phase: string | null;
  due_date: string | null;
};
type RequirementRow = {
  id: string;
  name: string;
  status: string;
  due_date: string;
};
type GrantRow = {
  id: string;
  funder_name: string;
  amount: number | null;
  application_deadline: string;
  status: string;
};
type PartnershipRow = {
  id: string;
  stage: string;
  next_step_date: string | null;
  organization: {
    name: string | null;
    preferred_name: string | null;
  } | null;
};

/**
 * The finance half, over the review window.
 *
 * The rollup goes through `get_finance_report_data`, which is `SECURITY
 * DEFINER` and gated on `finance_reports:view` -- exactly why a board member
 * sees an aggregate without table-level access to `event_expenses`,
 * `event_revenue` or `sales`. The two forward figures are ordinary RLS reads,
 * so each is gated on its own resource and comes back `null` rather than zero
 * when the caller's role does not carry it.
 */
async function readFinanceActivity(
  supabase: SupabaseClient,
  permissions: PermissionMap,
  windows: MeetingWindows,
): Promise<FinanceActivityContext | ContextUnavailable> {
  if (!hasPermission(permissions, "finance_reports", "view")) {
    return UNAVAILABLE_FORBIDDEN;
  }

  const canReadReimbursements = hasAnyPermission(permissions, [
    { resource: "reimbursements", level: "view" },
    { resource: "reimbursement_approvals", level: "manage" },
  ]);
  const canReadEvents = hasPermission(permissions, "events", "view");

  const [rollup, reimbursements, eventBudgets] = await Promise.all([
    supabase.rpc("get_finance_report_data", {
      p_from: windows.review.fromDate,
      p_to: windows.review.toDate,
    }),
    canReadReimbursements
      ? supabase
          .from("reimbursements")
          .select("amount")
          .in("status", ["submitted", "approved"])
      : null,
    canReadEvents
      ? supabase
          .from("events")
          .select("budget_amount")
          .eq("status", "published")
          .not("budget_amount", "is", null)
          .gte("starts_at", windows.lookahead.fromInstant)
          .lte("starts_at", windows.lookahead.toInstant)
      : null,
  ]);

  if (rollup.error) return UNAVAILABLE_ERROR;

  const raw = (rollup.data ?? {}) as Partial<FinanceReportData>;
  const summary = computeFinanceSummary({
    revenue: raw.revenue ?? [],
    expenses: raw.expenses ?? [],
    reimbursements: raw.reimbursements ?? [],
    in_kind_items: raw.in_kind_items ?? [],
    monetary_donations: raw.monetary_donations ?? [],
    sales: raw.sales ?? [],
  });

  const outstandingRows = (reimbursements?.data ?? []) as AmountRow[];
  const budgetRows = (eventBudgets?.data ?? []) as BudgetRow[];

  return {
    window: {
      fromDate: windows.review.fromDate,
      toDate: windows.review.toDate,
    },
    income: summary.income,
    cashDonations: summary.cashDonations,
    paidSpend: summary.paidSpend,
    net: summary.net,
    approvedUnpaidSpend: summary.approvedUnpaidSpend,
    pendingSpend: summary.pendingSpend,
    outstandingReimbursements:
      canReadReimbursements && !reimbursements?.error
        ? {
            total: outstandingRows.reduce(
              (total, row) => total + (row.amount ?? 0),
              0,
            ),
            count: outstandingRows.length,
          }
        : null,
    upcomingEventBudget:
      canReadEvents && !eventBudgets?.error
        ? {
            total: budgetRows.reduce(
              (total, row) => total + (row.budget_amount ?? 0),
              0,
            ),
            count: budgetRows.length,
          }
        : null,
  };
}

/**
 * The compliance half: the rows, not the dashboard's counts.
 *
 * `due_date` is a Postgres `date`, so the filters and the overdue test are
 * string comparisons against the organization's day -- the same reading
 * `getOrganizationSummary` uses, and the only one that does not drift with the
 * server's offset.
 *
 * The two lists treat an absent due date differently because their columns do.
 * A requirement always has one, so the filter is a plain `lte`. A milestone's
 * is nullable and most are blank -- the seeded 501(c)(3) checklist is entirely
 * undated -- so requiring one would leave the block empty under exactly the
 * heading that asks where the application stands. Undated milestones sort last
 * and fall back to the checklist's own order.
 */
async function readNonprofitCompliance(
  supabase: SupabaseClient,
  windows: MeetingWindows,
  today: string,
  disclosureYear: number,
): Promise<NonprofitComplianceContext | ContextUnavailable> {
  const dueBy = windows.lookahead.toDate;
  const [milestones, requirements, boardMembers, disclosures] =
    await Promise.all([
      supabase
        .from("nonprofit_status_milestones")
        .select("id, description, phase, due_date, sort_order", {
          count: "exact",
        })
        .not("status", "in", "(done,cancelled)")
        .or(`due_date.is.null,due_date.lte.${dueBy}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true })
        .limit(TOPIC_CONTEXT_ROW_LIMIT),
      supabase
        .from("annual_requirements")
        .select("id, name, status, due_date", { count: "exact" })
        .neq("status", "done")
        .lte("due_date", dueBy)
        .order("due_date", { ascending: true })
        .limit(TOPIC_CONTEXT_ROW_LIMIT),
      supabase.from("board_members").select("person_id").eq("is_active", true),
      supabase
        .from("conflict_of_interest_disclosures")
        .select("person_id")
        .eq("disclosure_year", disclosureYear),
    ]);

  if (
    milestones.error ||
    requirements.error ||
    boardMembers.error ||
    disclosures.error
  ) {
    return UNAVAILABLE_ERROR;
  }

  const disclosed = new Set(
    (disclosures.data ?? []).map((row) => row.person_id as string),
  );
  const active = (boardMembers.data ?? []).map(
    (row) => row.person_id as string,
  );

  return {
    milestones: {
      rows: ((milestones.data ?? []) as MilestoneRow[]).map((row) => ({
        id: row.id,
        label: row.description,
        detail: row.phase,
        dueDate: row.due_date,
        overdue: row.due_date !== null && row.due_date < today,
      })),
      total: milestones.count ?? 0,
    },
    requirements: {
      rows: ((requirements.data ?? []) as RequirementRow[]).map((row) => ({
        id: row.id,
        label: row.name,
        detail: row.status,
        dueDate: row.due_date,
        overdue: row.due_date < today,
      })),
      total: requirements.count ?? 0,
    },
    disclosures: {
      year: disclosureYear,
      missing: active.filter((personId) => !disclosed.has(personId)).length,
      boardMembers: active.length,
    },
  };
}

/** Open applications whose deadline is inside the lookahead or already past. */
async function readGrants(
  supabase: SupabaseClient,
  windows: MeetingWindows,
  today: string,
): Promise<ContextRows<GrantContextItem> | ContextUnavailable> {
  const { data, error, count } = await supabase
    .from("grants")
    .select("id, funder_name, amount, application_deadline, status", {
      count: "exact",
    })
    .in("status", OPEN_GRANT_STATUSES)
    .lte("application_deadline", windows.lookahead.toDate)
    .order("application_deadline", { ascending: true })
    .limit(TOPIC_CONTEXT_ROW_LIMIT);

  if (error) return UNAVAILABLE_ERROR;

  return {
    rows: ((data ?? []) as GrantRow[]).map((row) => ({
      id: row.id,
      funderName: row.funder_name,
      amount: row.amount,
      deadline: row.application_deadline,
      status: row.status as GrantStatus,
      overdue: row.application_deadline < today,
    })),
    total: count ?? 0,
  };
}

/**
 * Live opportunities, most recently moved first -- not by `next_step_date`,
 * which most rows leave null. A board asking "where are we with partners"
 * wants what has moved, and an undated row is still a live conversation.
 */
async function readPartnerships(
  supabase: SupabaseClient,
): Promise<ContextRows<PartnershipContextItem> | ContextUnavailable> {
  const { data, error, count } = await supabase
    .from("partnership_opportunities")
    .select(
      "id, stage, next_step_date, organization:people!partnership_opportunities_organization_person_id_fkey(name, preferred_name)",
      { count: "exact" },
    )
    .not("stage", "in", `(${CLOSED_PARTNERSHIP_STAGES.join(",")})`)
    .order("updated_at", { ascending: false })
    .limit(TOPIC_CONTEXT_ROW_LIMIT);

  if (error) return UNAVAILABLE_ERROR;

  return {
    rows: ((data ?? []) as unknown as PartnershipRow[]).map((row) => ({
      id: row.id,
      // `people` is readable here through the people_intake/reimbursement
      // carve-outs as well as `people:view`; where it is not, the stage and the
      // date still say something, so the row is kept and named generically.
      organization: personDisplayName(row.organization, "Partner organization"),
      stage: row.stage as PartnershipStage,
      nextStepDate: row.next_step_date,
    })),
    total: count ?? 0,
  };
}

/**
 * Every supporting source for one meeting, in one round of reads.
 *
 * Gated at `governance:view`, matching the meeting read it starts from. The
 * three governance-backed sources sit on tables whose select policy is that
 * same permission, so past this gate they can only fail, never be forbidden;
 * finance is the one source with a resource of its own.
 */
export async function getMeetingTopicContextAction(
  meetingId: string,
): Promise<{ data: MeetingTopicContext } | ActionFailure> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "governance", "view");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const [meetingResult, timeZone, permissions, fiscalYearStartMonth] =
    await Promise.all([
      supabase
        .from("governance_meetings")
        .select("id, meeting_date")
        .eq("id", meetingId)
        .maybeSingle(),
      getOrgTimeZone(supabase),
      getCurrentUserPermissions(supabase),
      getFiscalYearStartMonth(supabase),
    ]);

  if (meetingResult.error) {
    return actionError(
      "server_error",
      "Could not load the records behind this agenda. Please try again.",
    );
  }
  if (!meetingResult.data) {
    return actionError("conflict", "That meeting no longer exists.");
  }

  const meetingDate = meetingResult.data.meeting_date as string;
  // "Since the previous meeting", not a fixed 30 days back: a quarterly board
  // reviewing its own period would otherwise be shown the last month of it and
  // told nothing about the two before.
  const previous = await findPreviousMeeting(supabase, meetingId, meetingDate);
  const previousMeetingDate =
    "error" in previous ? null : (previous.meeting?.meeting_date ?? null);

  const windows = resolveMeetingWindows({
    meetingDate,
    previousMeetingDate,
    timeZone,
  });
  const today = todayInZone(timeZone);
  // The meeting's fiscal year, not today's: minutes from a June meeting should
  // report the disclosures that meeting was entitled to ask about, and a
  // July 1 boundary makes those two different answers.
  const disclosureYear = fiscalYearForDate(
    utcDateFromIsoDay(windows.lookahead.fromDate),
    fiscalYearStartMonth,
  );

  const [finance, compliance, grants, partnerships] = await Promise.all([
    readFinanceActivity(supabase, permissions, windows),
    readNonprofitCompliance(supabase, windows, today, disclosureYear),
    readGrants(supabase, windows, today),
    readPartnerships(supabase),
  ]);

  return {
    data: {
      timeZone,
      asOf: today,
      review: {
        fromDate: windows.review.fromDate,
        toDate: windows.review.toDate,
      },
      lookahead: {
        fromDate: windows.lookahead.fromDate,
        toDate: windows.lookahead.toDate,
      },
      finance_activity: finance,
      nonprofit_compliance: compliance,
      grants,
      partnerships,
    },
  };
}
