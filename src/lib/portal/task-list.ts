/**
 * The shared vocabulary for module-level task lists (#1643, #1658).
 *
 * Every list that answers "what's open, who has it, what's overdue" --
 * Governance's Open work page now, the Events list's outstanding tasks next
 * (#1661), an org-wide My tasks page later -- normalizes its sources into one
 * row shape and filters it with one set of words. That is what lets a later
 * page union the sources without a redesign: the rows already agree.
 *
 * Pure and client-safe, so the filter bar and the server query read the same
 * definitions. Dates are Postgres `date` values ("YYYY-MM-DD") compared as
 * strings, and "today" is the caller's -- the organization's day, from
 * `todayInZone` -- never the server process's UTC one.
 */

export type TaskOwner = {
  id: string;
  name: string | null;
  preferred_name?: string | null;
  email: string | null;
  phone: string | null;
};

export type TaskRow<K extends string = string> = {
  /** Unique across sources: `${kind}:${id}`. */
  key: string;
  /** The source record's id. */
  id: string;
  kind: K;
  title: string;
  owner: TaskOwner | null;
  /** "YYYY-MM-DD", date-only. */
  dueDate: string | null;
  /** The source's own status value, e.g. `in_progress` or `closed_won`. */
  status: string;
  statusLabel: string;
  /** Whether the status counts as finished for the status filter. */
  isDone: boolean;
  /** The record or meeting the row came from. */
  source: { label: string; href: string };
  /** Whether the viewer gets inline edit controls on this row. */
  canEdit: boolean;
};

/** `mine` resolves through the signed-in user's `people` row. */
export type TaskOwnerFilter = "all" | "mine" | "unassigned" | (string & {});
export type TaskDueFilter = "all" | "overdue" | "week";
export type TaskStatusFilter = "open" | "done" | "all";

export type TaskFilters = {
  owner: TaskOwnerFilter;
  /** A row kind, or `all`. */
  type: string;
  due: TaskDueFilter;
  status: TaskStatusFilter;
};

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  owner: "all",
  type: "all",
  due: "all",
  status: "open",
};

export const TASK_DUE_FILTER_LABELS: Record<TaskDueFilter, string> = {
  all: "Any date",
  overdue: "Overdue",
  week: "Due this week",
};

export const TASK_STATUS_FILTER_LABELS: Record<TaskStatusFilter, string> = {
  open: "Open",
  done: "Done",
  all: "All",
};

const DUE_FILTERS: readonly TaskDueFilter[] = ["all", "overdue", "week"];
const STATUS_FILTERS: readonly TaskStatusFilter[] = ["open", "done", "all"];

type SearchParamsLike =
  URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * The URL name of one filter. A list that shares its page with other
 * filters -- the Events list's outstanding tasks (#1661), beside the events
 * table's own `status` -- passes a prefix: `task` gives `taskOwner`.
 */
export function taskFilterParamName(
  key: keyof TaskFilters,
  prefix = "",
): string {
  return prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
}

function readParam(params: SearchParamsLike, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * The filters a URL names. Anything unrecognised falls back to the default
 * rather than erroring, so a stale link still opens the list. `type` is
 * checked against `kinds` for the same reason.
 */
export function parseTaskFilters(
  params: SearchParamsLike,
  kinds: readonly string[],
  prefix = "",
): TaskFilters {
  const read = (key: keyof TaskFilters) =>
    readParam(params, taskFilterParamName(key, prefix));
  const owner = read("owner")?.trim() || "all";
  const type = read("type") ?? "all";
  const due = read("due") as TaskDueFilter | null;
  const status = read("status") as TaskStatusFilter | null;

  return {
    owner,
    type: kinds.includes(type) ? type : "all",
    due: due && DUE_FILTERS.includes(due) ? due : DEFAULT_TASK_FILTERS.due,
    status:
      status && STATUS_FILTERS.includes(status)
        ? status
        : DEFAULT_TASK_FILTERS.status,
  };
}

/** The query string for `filters`, leaving defaults out. */
export function serializeTaskFilters(
  filters: TaskFilters,
  prefix = "",
): string {
  const params = new URLSearchParams();
  for (const key of ["owner", "type", "due", "status"] as const) {
    if (filters[key] !== DEFAULT_TASK_FILTERS[key]) {
      params.set(taskFilterParamName(key, prefix), filters[key]);
    }
  }
  return params.toString();
}

/** `day` plus `days`, both "YYYY-MM-DD". */
export function addIsoDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Past due and not finished. A done item is never overdue. */
export function isTaskOverdue(
  row: Pick<TaskRow, "dueDate" | "isDone">,
  today: string,
): boolean {
  return !row.isDone && row.dueDate !== null && row.dueDate < today;
}

/** Due today or within the six days after it -- a rolling week. */
export function isTaskDueThisWeek(
  row: Pick<TaskRow, "dueDate">,
  today: string,
): boolean {
  return (
    row.dueDate !== null &&
    row.dueDate >= today &&
    row.dueDate <= addIsoDays(today, 6)
  );
}

export type TaskFilterContext = {
  today: string;
  currentPersonId: string | null;
};

export function matchesTaskFilters(
  row: TaskRow,
  filters: TaskFilters,
  context: TaskFilterContext,
): boolean {
  if (filters.status === "open" && row.isDone) return false;
  if (filters.status === "done" && !row.isDone) return false;
  if (filters.type !== "all" && row.kind !== filters.type) return false;
  return matchesTaskOwnerAndDue(row, filters, context);
}

/**
 * The owner and due half of the vocabulary on its own, for a page that keeps
 * its own layout and only borrows these two filters -- the Nonprofit status
 * and Annual requirements checklists (#1659), which show every status.
 */
export function matchesTaskOwnerAndDue(
  row: Pick<TaskRow, "owner" | "dueDate" | "isDone">,
  filters: Pick<TaskFilters, "owner" | "due">,
  context: TaskFilterContext,
): boolean {
  const ownerId = row.owner?.id ?? null;
  if (filters.owner === "mine") {
    // No people row for the signed-in user means nothing is theirs, not
    // everything that has no owner.
    if (!context.currentPersonId || ownerId !== context.currentPersonId) {
      return false;
    }
  } else if (filters.owner === "unassigned") {
    if (ownerId !== null) return false;
  } else if (filters.owner !== "all" && ownerId !== filters.owner) {
    return false;
  }

  if (filters.due === "overdue" && !isTaskOverdue(row, context.today)) {
    return false;
  }
  if (filters.due === "week" && !isTaskDueThisWeek(row, context.today)) {
    return false;
  }
  return true;
}

/**
 * Overdue first, then by due date ascending, then rows with no due date.
 * Ties fall back to the title so the order is stable across reloads.
 */
export function compareTaskRows(a: TaskRow, b: TaskRow, today: string): number {
  const rank = (row: TaskRow) =>
    isTaskOverdue(row, today) ? 0 : row.dueDate === null ? 2 : 1;
  return (
    rank(a) - rank(b) ||
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
    a.title.localeCompare(b.title)
  );
}

export function filterAndSortTaskRows<R extends TaskRow>(
  rows: readonly R[],
  filters: TaskFilters,
  context: TaskFilterContext,
): R[] {
  return rows
    .filter((row) => matchesTaskFilters(row, filters, context))
    .sort((a, b) => compareTaskRows(a, b, context.today));
}

/**
 * The people a list can be filtered to: everyone who owns one of `rows`,
 * by display name. Taken from the rows rather than the whole `people` table,
 * which also holds every donor and organization.
 */
export function taskOwnerOptions(
  rows: readonly Pick<TaskRow, "owner">[],
): TaskOwner[] {
  const owners = new Map<string, TaskOwner>();
  for (const row of rows) {
    if (row.owner) owners.set(row.owner.id, row.owner);
  }
  const label = (owner: TaskOwner) =>
    owner.preferred_name?.trim() || owner.name?.trim() || owner.email || "";
  return [...owners.values()].sort((a, b) => label(a).localeCompare(label(b)));
}
