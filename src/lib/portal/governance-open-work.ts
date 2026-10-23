import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCalendarDate } from "@/lib/format";
import { utcIsoToDateInZone } from "@/lib/time";
import { resolveTaskFilterContext } from "./task-filter-context";
import {
  filterAndSortTaskRows,
  taskOwnerOptions,
  type TaskFilters,
  type TaskOwner,
  type TaskRow,
} from "./task-list";
import type { MilestoneStatus } from "@/app/portal/(app)/governance/nonprofit-status/nonprofit-status-form";
import { MILESTONE_STATUS_LABELS } from "@/app/portal/(app)/governance/nonprofit-status/nonprofit-status-badges";
import type { RequirementStatus } from "@/app/portal/(app)/governance/annual-requirements/annual-requirement-form";
import { REQUIREMENT_STATUS_LABELS } from "@/app/portal/(app)/governance/annual-requirements/annual-requirements-badges";
import {
  CLOSED_PARTNERSHIP_STAGES,
  PARTNERSHIP_STAGE_LABELS,
  PARTNERSHIP_STAGES,
} from "@/app/portal/(app)/governance/partnerships/partnership-opportunity-form";
import type { Grant } from "@/app/portal/(app)/governance/grants/grants-actions";
import type { PartnershipOpportunity } from "@/app/portal/(app)/governance/partnerships/partnerships-actions";

/**
 * Governance's Open work (#1658): every open item the module tracks, from the
 * five tables that each had only a page of their own, as one `TaskRow` list.
 *
 * Lives here rather than beside the page so the org-wide My tasks page
 * (#1643, out of scope) can union it with the Events sources unchanged.
 * Reads through the caller's client, so RLS -- `governance` on every one of
 * these tables -- decides what comes back.
 */

export const GOVERNANCE_OPEN_WORK_KINDS = [
  "action_item",
  "milestone",
  "annual_requirement",
  "grant",
  "partnership",
] as const;

export type GovernanceOpenWorkKind =
  (typeof GOVERNANCE_OPEN_WORK_KINDS)[number];

export const GOVERNANCE_OPEN_WORK_KIND_LABELS: Record<
  GovernanceOpenWorkKind,
  string
> = {
  action_item: "Action item",
  milestone: "Nonprofit status milestone",
  annual_requirement: "Annual requirement",
  grant: "Grant deadline",
  partnership: "Partnership next step",
};

export const ACTION_ITEM_STATUS_LABELS: Record<"open" | "done", string> = {
  open: "Open",
  done: "Done",
};

/**
 * What each inline action needs to resubmit the source's own form without
 * clearing a field the Open work row doesn't show -- the existing update
 * actions replace the whole row from the form they are sent.
 */
export type ActionItemRecord = {
  description: string;
  due_date: string | null;
  status: "open" | "done";
  meeting_id: string;
};

export type MilestoneRecord = {
  description: string;
  phase: string;
  due_date: string | null;
  status: MilestoneStatus;
  notes: string | null;
};

export type AnnualRequirementRecord = {
  name: string;
  due_date: string;
  status: RequirementStatus;
  external_link: string | null;
  document_path: string | null;
  body_text: string | null;
};

export type GovernanceOpenWorkRow =
  | (TaskRow<"action_item"> & { record: ActionItemRecord })
  | (TaskRow<"milestone"> & { record: MilestoneRecord })
  | (TaskRow<"annual_requirement"> & { record: AnnualRequirementRecord })
  | (TaskRow<"grant"> & { record: Grant })
  | (TaskRow<"partnership"> & { record: PartnershipOpportunity });

const OWNER_FIELDS = "id, name, preferred_name, email, phone";

const ACTION_ITEM_SELECT = `id, meeting_id, description, due_date, status, owner:people!governance_meeting_action_items_owner_person_id_fkey(${OWNER_FIELDS}), meeting:governance_meetings(meeting_date, meeting_type)`;
const MILESTONE_SELECT = `id, description, phase, due_date, status, notes, owner:people!nonprofit_status_milestones_owner_person_id_fkey(${OWNER_FIELDS})`;
const REQUIREMENT_SELECT = `id, name, due_date, status, external_link, document_path, body_text, responsible:people!annual_requirements_responsible_person_id_fkey(${OWNER_FIELDS})`;
// The same columns the Grants and Partnerships pages select, so the edit
// modals those pages render can be opened from here unchanged.
const GRANT_SELECT = `id, funder_name, amount, application_deadline, status, notes, owner:people!grants_owner_person_id_fkey(${OWNER_FIELDS})`;
const PARTNERSHIP_SELECT = `id, stage, next_step_date, notes, organization:people!partnership_opportunities_organization_person_id_fkey(${OWNER_FIELDS}), owner:people!partnership_opportunities_owner_person_id_fkey(${OWNER_FIELDS})`;

type ActionItemQueryRow = ActionItemRecord & {
  id: string;
  owner: TaskOwner | null;
  meeting: { meeting_date: string; meeting_type: string } | null;
};
type MilestoneQueryRow = MilestoneRecord & {
  id: string;
  owner: TaskOwner | null;
};
type RequirementQueryRow = AnnualRequirementRecord & {
  id: string;
  responsible: TaskOwner | null;
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function meetingLabel(
  meeting: ActionItemQueryRow["meeting"],
  timeZone: string,
): string {
  if (!meeting) return "Meeting";
  // meeting_date is an instant; the day it names is the organization's.
  const day = utcIsoToDateInZone(meeting.meeting_date, timeZone);
  return `${capitalize(meeting.meeting_type)} meeting, ${formatCalendarDate(day)}`;
}

function failed(source: string, error: { message: string }): never {
  throw new Error(`Could not load ${source} for Open work: ${error.message}`);
}

/**
 * Every row of the five sources that `status` admits, unfiltered by owner or
 * due date. The status filter is applied here, in SQL, because done items
 * accumulate for as long as the organization exists; the rest are applied by
 * `filterAndSortTaskRows` to a set that is already small.
 */
export async function listGovernanceOpenWorkRows(
  supabase: SupabaseClient,
  options: {
    status: TaskFilters["status"];
    type: TaskFilters["type"];
    timeZone: string;
    canEdit: boolean;
  },
): Promise<GovernanceOpenWorkRow[]> {
  const { status, type, timeZone, canEdit } = options;
  const wants = (kind: GovernanceOpenWorkKind) =>
    type === "all" || type === kind;

  const actionItems = async (): Promise<GovernanceOpenWorkRow[]> => {
    if (!wants("action_item")) return [];
    let query = supabase
      .from("governance_meeting_action_items")
      .select(ACTION_ITEM_SELECT);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) failed("action items", error);
    return ((data ?? []) as unknown as ActionItemQueryRow[]).map((row) => ({
      key: `action_item:${row.id}`,
      id: row.id,
      kind: "action_item",
      title: row.description,
      owner: row.owner,
      dueDate: row.due_date,
      status: row.status,
      statusLabel: ACTION_ITEM_STATUS_LABELS[row.status],
      isDone: row.status === "done",
      source: {
        label: meetingLabel(row.meeting, timeZone),
        href: `/portal/governance/meetings/${row.meeting_id}#action-items-section`,
      },
      canEdit,
      record: {
        description: row.description,
        due_date: row.due_date,
        status: row.status,
        meeting_id: row.meeting_id,
      },
    }));
  };

  const milestones = async (): Promise<GovernanceOpenWorkRow[]> => {
    if (!wants("milestone")) return [];
    let query = supabase
      .from("nonprofit_status_milestones")
      .select(MILESTONE_SELECT);
    if (status === "open") {
      query = query.in("status", ["not_started", "in_progress"]);
    } else if (status === "done") {
      query = query.in("status", ["done", "cancelled"]);
    }
    const { data, error } = await query;
    if (error) failed("milestones", error);
    return ((data ?? []) as unknown as MilestoneQueryRow[]).map((row) => ({
      key: `milestone:${row.id}`,
      id: row.id,
      kind: "milestone",
      title: row.description,
      owner: row.owner,
      dueDate: row.due_date,
      status: row.status,
      statusLabel: MILESTONE_STATUS_LABELS[row.status],
      isDone: row.status === "done" || row.status === "cancelled",
      source: {
        label: "Nonprofit status",
        href: "/portal/governance/nonprofit-status",
      },
      canEdit,
      record: {
        description: row.description,
        phase: row.phase,
        due_date: row.due_date,
        status: row.status,
        notes: row.notes,
      },
    }));
  };

  const requirements = async (): Promise<GovernanceOpenWorkRow[]> => {
    if (!wants("annual_requirement")) return [];
    let query = supabase.from("annual_requirements").select(REQUIREMENT_SELECT);
    if (status === "open") {
      query = query.in("status", ["not_started", "in_progress"]);
    } else if (status === "done") {
      query = query.eq("status", "done");
    }
    const { data, error } = await query;
    if (error) failed("annual requirements", error);
    return ((data ?? []) as unknown as RequirementQueryRow[]).map((row) => ({
      key: `annual_requirement:${row.id}`,
      id: row.id,
      kind: "annual_requirement",
      title: row.name,
      owner: row.responsible,
      dueDate: row.due_date,
      status: row.status,
      statusLabel: REQUIREMENT_STATUS_LABELS[row.status],
      isDone: row.status === "done",
      source: {
        label: "Annual requirements",
        href: "/portal/governance/annual-requirements",
      },
      canEdit,
      record: {
        name: row.name,
        due_date: row.due_date,
        status: row.status,
        external_link: row.external_link,
        document_path: row.document_path,
        body_text: row.body_text,
      },
    }));
  };

  const grants = async (): Promise<GovernanceOpenWorkRow[]> => {
    // Only a planned application is work still to do; once submitted the
    // next move is the funder's. So there is nothing "done" to show here.
    if (!wants("grant") || status === "done") return [];
    const { data, error } = await supabase
      .from("grants")
      .select(GRANT_SELECT)
      .eq("status", "planned")
      .not("application_deadline", "is", null);
    if (error) failed("grants", error);
    return ((data ?? []) as unknown as Grant[]).map((grant) => ({
      key: `grant:${grant.id}`,
      id: grant.id,
      kind: "grant",
      title: grant.funder_name,
      owner: grant.owner,
      dueDate: grant.application_deadline,
      status: grant.status,
      statusLabel: "Planned",
      isDone: false,
      source: { label: "Grants", href: "/portal/governance/grants" },
      canEdit,
      record: grant,
    }));
  };

  const partnerships = async (): Promise<GovernanceOpenWorkRow[]> => {
    if (!wants("partnership")) return [];
    let query = supabase
      .from("partnership_opportunities")
      .select(PARTNERSHIP_SELECT)
      .not("next_step_date", "is", null);
    if (status === "open") {
      query = query.in(
        "stage",
        PARTNERSHIP_STAGES.filter(
          (stage) => !CLOSED_PARTNERSHIP_STAGES.includes(stage),
        ),
      );
    } else if (status === "done") {
      query = query.in("stage", [...CLOSED_PARTNERSHIP_STAGES]);
    }
    const { data, error } = await query;
    if (error) failed("partnerships", error);
    return ((data ?? []) as unknown as PartnershipOpportunity[]).map(
      (opportunity) => ({
        key: `partnership:${opportunity.id}`,
        id: opportunity.id,
        kind: "partnership",
        title: opportunity.organization?.name ?? "Partnership",
        owner: opportunity.owner,
        dueDate: opportunity.next_step_date,
        status: opportunity.stage,
        statusLabel: PARTNERSHIP_STAGE_LABELS[opportunity.stage],
        isDone: CLOSED_PARTNERSHIP_STAGES.includes(opportunity.stage),
        source: {
          label: "Partnerships",
          href: "/portal/governance/partnerships",
        },
        canEdit,
        record: opportunity,
      }),
    );
  };

  const sources = await Promise.all([
    actionItems(),
    milestones(),
    requirements(),
    grants(),
    partnerships(),
  ]);
  return sources.flat();
}

export type GovernanceOpenWork = {
  rows: GovernanceOpenWorkRow[];
  /** Everyone who owns a row before the owner and due filters apply. */
  owners: TaskOwner[];
  today: string;
};

/**
 * The Open work list as `filters` describe it, sorted overdue first.
 * `today` defaults to the organization's day; tests pass their own.
 */
export async function getGovernanceOpenWork(
  supabase: SupabaseClient,
  filters: TaskFilters,
  options: { canEdit: boolean; today?: string },
): Promise<GovernanceOpenWork> {
  const { timeZone, today, currentPersonId } = await resolveTaskFilterContext(
    supabase,
    filters,
    { today: options.today },
  );
  const rows = await listGovernanceOpenWorkRows(supabase, {
    status: filters.status,
    type: filters.type,
    timeZone,
    canEdit: options.canEdit,
  });

  return {
    rows: filterAndSortTaskRows(rows, filters, { today, currentPersonId }),
    owners: taskOwnerOptions(rows),
    today,
  };
}
