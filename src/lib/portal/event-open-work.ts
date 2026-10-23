import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTaskFilterContext } from "./task-filter-context";
import {
  filterAndSortTaskRows,
  taskOwnerOptions,
  type TaskFilters,
  type TaskOwner,
  type TaskRow,
} from "./task-list";
import { deriveEventPhaseTasks } from "@/app/portal/(app)/events/phase-status";
import type { EventRow } from "@/app/portal/(app)/events/event-badges";

/**
 * The Events list's Outstanding tasks (#1661): every open piece of event work
 * as one `TaskRow` list, in the vocabulary Governance's Open work set (#1658).
 *
 * Four sources:
 *  - `event_checklist_items` not done -- not scoped by event status, since a
 *    manually added item ("send thank-you emails") can outlive the event;
 *  - retro action items (`event_retro_items`, kind `action`) still open;
 *  - sponsor follow-ups (`event_sponsors.follow_up_status`) not `done`;
 *  - phase-derived tasks (events/phase-status.ts) on draft and published
 *    events, owned by the event lead. These are read-only: you finish them by
 *    doing the work on the event page, so they have no "done" to list.
 *
 * Also the dashboard's Outstanding tasks count, so the two cannot disagree.
 * Reads through the caller's client: every source is `events:view` under RLS,
 * and what the viewer may change is the caller's `canEdit`.
 */

export const EVENT_OPEN_WORK_KINDS = [
  "checklist",
  "retro_action",
  "sponsor_follow_up",
  "phase",
] as const;

export type EventOpenWorkKind = (typeof EVENT_OPEN_WORK_KINDS)[number];

export const EVENT_OPEN_WORK_KIND_LABELS: Record<EventOpenWorkKind, string> = {
  checklist: "Checklist item",
  retro_action: "Retro action",
  sponsor_follow_up: "Sponsor follow-up",
  phase: "Event phase",
};

/** The URL prefix for this list's filters, beside the events table's own. */
export const EVENT_OPEN_WORK_PARAM_PREFIX = "task";

const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export type EventOpenWorkRow = TaskRow<EventOpenWorkKind> & {
  event: { id: string; name: string; startsAt: string };
};

const OWNER_FIELDS = "id, name, preferred_name, email, phone";
const EVENT_FIELDS = "id, name, starts_at";

const CHECKLIST_SELECT = `id, title, is_done, due_date, owner:people!event_checklist_items_owner_in_tenant(${OWNER_FIELDS}), event:events!inner(${EVENT_FIELDS})`;
const RETRO_SELECT = `id, body, status, owner:people!event_retro_items_owner_in_tenant(${OWNER_FIELDS}), event:events!inner(${EVENT_FIELDS})`;
const SPONSOR_SELECT = `id, follow_up_status, follow_up_due_date, person:people!event_sponsors_person_id_fkey(name), owner:people!event_sponsors_follow_up_owner_in_tenant(${OWNER_FIELDS}), event:events!inner(${EVENT_FIELDS})`;
// The columns deriveEventPhaseTasks reads, plus the lead who owns its tasks.
const PHASE_EVENT_SELECT = `${EVENT_FIELDS}, event_lead_id, capacity, budget_amount, attendance_count, report_status, lead:people!events_event_lead_id_fkey(${OWNER_FIELDS})`;

type EventRef = { id: string; name: string; starts_at: string };

type ChecklistQueryRow = {
  id: string;
  title: string;
  is_done: boolean;
  due_date: string | null;
  owner: TaskOwner | null;
  event: EventRef;
};
type RetroQueryRow = {
  id: string;
  body: string;
  status: "open" | "done";
  owner: TaskOwner | null;
  event: EventRef;
};
type SponsorQueryRow = {
  id: string;
  follow_up_status: string;
  follow_up_due_date: string | null;
  person: { name: string | null } | null;
  owner: TaskOwner | null;
  event: EventRef;
};
type PhaseEventQueryRow = EventRef & {
  event_lead_id: string | null;
  capacity: number | null;
  budget_amount: number | null;
  attendance_count: number | null;
  report_status: string;
  lead: TaskOwner | null;
};

function failed(source: string, error: { message: string }): never {
  throw new Error(
    `Could not load ${source} for Outstanding tasks: ${error.message}`,
  );
}

function eventOf(ref: EventRef): EventOpenWorkRow["event"] {
  return { id: ref.id, name: ref.name, startsAt: ref.starts_at };
}

function eventSource(ref: EventRef, tab: string) {
  return { label: ref.name, href: `/portal/events/${ref.id}?tab=${tab}` };
}

/**
 * Every row of the four sources that `status` admits, unfiltered by owner,
 * type or due date -- so the open rows among them are the whole count, which
 * the dashboard and the sheet's badge both show. Done rows are read only when
 * asked for, since they accumulate for as long as the organization exists.
 */
export async function listEventOpenWorkRows(
  supabase: SupabaseClient,
  options: {
    status: TaskFilters["status"];
    canEdit: boolean;
    nowIso?: string;
  },
): Promise<EventOpenWorkRow[]> {
  const { status, canEdit } = options;
  const now = new Date(options.nowIso ?? new Date().toISOString());

  const checklist = async (): Promise<EventOpenWorkRow[]> => {
    let query = supabase.from("event_checklist_items").select(CHECKLIST_SELECT);
    if (status !== "all") query = query.eq("is_done", status === "done");
    const { data, error } = await query;
    if (error) failed("checklist items", error);
    return ((data ?? []) as unknown as ChecklistQueryRow[]).map((row) => ({
      key: `checklist:${row.id}`,
      id: row.id,
      kind: "checklist",
      title: row.title,
      owner: row.owner,
      dueDate: row.due_date,
      status: row.is_done ? "done" : "open",
      statusLabel: row.is_done ? "Done" : "Open",
      isDone: row.is_done,
      source: eventSource(row.event, "checklist"),
      canEdit,
      event: eventOf(row.event),
    }));
  };

  const retroActions = async (): Promise<EventOpenWorkRow[]> => {
    let query = supabase
      .from("event_retro_items")
      .select(RETRO_SELECT)
      .eq("kind", "action");
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) failed("retro actions", error);
    return ((data ?? []) as unknown as RetroQueryRow[]).map((row) => ({
      key: `retro_action:${row.id}`,
      id: row.id,
      kind: "retro_action",
      title: row.body,
      owner: row.owner,
      dueDate: null,
      status: row.status,
      statusLabel: row.status === "done" ? "Done" : "Open",
      isDone: row.status === "done",
      source: eventSource(row.event, "results"),
      canEdit,
      event: eventOf(row.event),
    }));
  };

  const sponsorFollowUps = async (): Promise<EventOpenWorkRow[]> => {
    let query = supabase.from("event_sponsors").select(SPONSOR_SELECT);
    if (status === "open") query = query.neq("follow_up_status", "done");
    if (status === "done") query = query.eq("follow_up_status", "done");
    const { data, error } = await query;
    if (error) failed("sponsor follow-ups", error);
    return ((data ?? []) as unknown as SponsorQueryRow[]).map((row) => ({
      key: `sponsor_follow_up:${row.id}`,
      id: row.id,
      kind: "sponsor_follow_up",
      title: `Follow up with ${row.person?.name ?? "sponsor"}`,
      owner: row.owner,
      dueDate: row.follow_up_due_date,
      status: row.follow_up_status,
      statusLabel:
        FOLLOW_UP_STATUS_LABELS[row.follow_up_status] ?? row.follow_up_status,
      isDone: row.follow_up_status === "done",
      source: eventSource(row.event, "sponsors"),
      canEdit,
      event: eventOf(row.event),
    }));
  };

  const phaseTasks = async (): Promise<EventOpenWorkRow[]> => {
    if (status === "done") return [];
    // Cancelled and archived events are done by definition, even with a
    // phase never filled in. A past published event stays in scope (#1609):
    // its open work is the after-report.
    const { data, error } = await supabase
      .from("events")
      .select(PHASE_EVENT_SELECT)
      .in("status", ["draft", "published"]);
    if (error) failed("event phases", error);
    return ((data ?? []) as unknown as PhaseEventQueryRow[]).flatMap((row) =>
      // The phase rules only read the columns selected above, so this
      // narrower row can stand in for the EventRow they are typed against.
      // includeRetro stays off: individual retro actions are listed above,
      // and "Retro not started" on every past event is not work anyone owes.
      deriveEventPhaseTasks(row as unknown as EventRow, {}, now).map(
        (task) => ({
          key: `phase:${task.kind}:${row.id}`,
          id: row.id,
          kind: "phase" as const,
          title: task.taskLabel,
          owner: row.lead,
          dueDate: null,
          status: "open",
          statusLabel: "Open",
          isDone: false,
          source: eventSource(row, task.tab),
          canEdit: false,
          event: eventOf(row),
        }),
      ),
    );
  };

  const sources = await Promise.all([
    checklist(),
    retroActions(),
    sponsorFollowUps(),
    phaseTasks(),
  ]);
  return sources.flat();
}

export type EventOpenWork = {
  rows: EventOpenWorkRow[];
  /** Everyone who owns a row before the owner and due filters apply. */
  owners: TaskOwner[];
  /** Every open row, before any filter: the dashboard's number. */
  openCount: number;
  today: string;
};

/**
 * The Outstanding tasks list as `filters` describe it, sorted overdue first.
 * `today` defaults to the organization's day; tests pass their own.
 */
export async function getEventOpenWork(
  supabase: SupabaseClient,
  filters: TaskFilters,
  options: { canEdit: boolean; today?: string; nowIso?: string },
): Promise<EventOpenWork> {
  const { today, currentPersonId } = await resolveTaskFilterContext(
    supabase,
    filters,
    { today: options.today },
  );
  // "done" still reads the open rows, so the count stays whole whatever the
  // status filter says.
  const rows = await listEventOpenWorkRows(supabase, {
    status: filters.status === "open" ? "open" : "all",
    canEdit: options.canEdit,
    nowIso: options.nowIso,
  });

  return {
    rows: filterAndSortTaskRows(rows, filters, { today, currentPersonId }),
    owners: taskOwnerOptions(rows),
    openCount: rows.filter((row) => !row.isDone).length,
    today,
  };
}

/** The dashboard's Outstanding tasks count: the list's unfiltered total. */
export async function countEventOpenWork(
  supabase: SupabaseClient,
  nowIso?: string,
): Promise<number> {
  const rows = await listEventOpenWorkRows(supabase, {
    status: "open",
    canEdit: false,
    nowIso,
  });
  return rows.length;
}
