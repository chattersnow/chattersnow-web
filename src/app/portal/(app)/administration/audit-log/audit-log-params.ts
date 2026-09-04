import { parsePage } from "@/lib/pagination";

export const TABLE_VALUES = [
  "donations",
  "inventory_items",
  "inventory_movements",
  "events",
  "event_expenses",
  "user_roles",
  "app_settings",
  "calendar_items",
  "content_opportunities",
  "services",
  "assets",
  "access_grants",
] as const;

export const ACTION_VALUES = ["insert", "update", "delete"] as const;

export const SORTABLE_COLUMNS = [
  "occurred_at",
  "table_name",
  "action",
] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export type TableFilter = (typeof TABLE_VALUES)[number] | "all";
export type ActionFilter = (typeof ACTION_VALUES)[number] | "all";

export type AuditLogParams = {
  sort: SortColumn;
  dir: "asc" | "desc";
  table: TableFilter;
  action: ActionFilter;
  actor: string;
  from: string;
  to: string;
  page: number;
};

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

export function parseAuditLogParams(
  searchParams: Record<string, string | string[] | undefined>,
): AuditLogParams {
  const raw = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "occurred_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const tableRaw = raw("table");
  const table: TableFilter = TABLE_VALUES.includes(
    tableRaw as (typeof TABLE_VALUES)[number],
  )
    ? (tableRaw as (typeof TABLE_VALUES)[number])
    : "all";

  const actionRaw = raw("action");
  const action: ActionFilter = ACTION_VALUES.includes(
    actionRaw as (typeof ACTION_VALUES)[number],
  )
    ? (actionRaw as (typeof ACTION_VALUES)[number])
    : "all";

  const actor = raw("actor") || "all";
  const from = raw("from") || "";
  const to = raw("to") || "";
  const page = parsePage(raw("page"));

  return { sort, dir, table, action, actor, from, to, page };
}
