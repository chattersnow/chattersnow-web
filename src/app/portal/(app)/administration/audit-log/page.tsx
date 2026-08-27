import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildHref,
  pageRange,
  parsePage,
  totalPagesFor,
} from "@/lib/pagination";
import { listUsersAction } from "../users/actions";
import { ActionBadge, TABLE_LABELS } from "./audit-log-badges";
import {
  AuditLogDetailSheet,
  type AuditLogRow,
} from "./audit-log-detail-sheet";

const TABLE_VALUES = [
  "donations",
  "inventory_items",
  "inventory_movements",
  "event_expenses",
  "user_roles",
  "app_settings",
  "calendar_items",
  "content_opportunities",
] as const;

const ACTION_VALUES = ["insert", "update", "delete"] as const;

const SORTABLE_COLUMNS = ["occurred_at", "table_name", "action"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "occurred_at", label: "Occurred at" },
  { key: "table_name", label: "Table" },
  { key: "action", label: "Action" },
];

type AuditLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditLogPage({
  searchParams,
}: AuditLogPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "occurred_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const tableRaw = raw("table");
  const tableFilter = TABLE_VALUES.includes(
    tableRaw as (typeof TABLE_VALUES)[number],
  )
    ? (tableRaw as (typeof TABLE_VALUES)[number])
    : "all";

  const actionRaw = raw("action");
  const actionFilter = ACTION_VALUES.includes(
    actionRaw as (typeof ACTION_VALUES)[number],
  )
    ? (actionRaw as (typeof ACTION_VALUES)[number])
    : "all";

  const actorFilter = raw("actor") || "all";
  const fromDate = raw("from") || "";
  const toDate = raw("to") || "";

  const page = parsePage(raw("page"));

  const usersResult = await listUsersAction();
  const users = "data" in usersResult ? usersResult.data : [];
  const actorEmailById = new Map(
    users.map((user) => [user.user_id, user.email ?? user.user_id]),
  );

  let query = supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, actor_id, occurred_at, old_data, new_data",
      {
        count: "exact",
      },
    )
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (tableFilter !== "all") query = query.eq("table_name", tableFilter);
  if (actionFilter !== "all") query = query.eq("action", actionFilter);
  if (actorFilter !== "all") query = query.eq("actor_id", actorFilter);
  if (fromDate) query = query.gte("occurred_at", `${fromDate}T00:00:00.000Z`);
  if (toDate) query = query.lte("occurred_at", `${toDate}T23:59:59.999Z`);

  const { offset, to } = pageRange(page);
  const { data: entries, error, count } = await query.range(offset, to);

  const filterParams = new URLSearchParams();
  if (tableFilter !== "all") filterParams.set("table", tableFilter);
  if (actionFilter !== "all") filterParams.set("action", actionFilter);
  if (actorFilter !== "all") filterParams.set("actor", actorFilter);
  if (fromDate) filterParams.set("from", fromDate);
  if (toDate) filterParams.set("to", toDate);

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "desc" ? "asc" : "desc";
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  function SortIcon({ column }: { column: SortColumn }) {
    if (sort !== column) {
      return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    }
    return dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  }

  const hasActiveFilters =
    tableFilter !== "all" ||
    actionFilter !== "all" ||
    actorFilter !== "all" ||
    !!fromDate ||
    !!toDate;

  const totalPages = totalPagesFor(count);

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Audit Log
      </h1>

      <div className="mt-6 flex flex-wrap items-end justify-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="table"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Table
            </label>
            <select
              id="table"
              name="table"
              defaultValue={tableFilter}
              className={selectClassName}
            >
              <option value="all">All tables</option>
              {TABLE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TABLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="action"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Action
            </label>
            <select
              id="action"
              name="action"
              defaultValue={actionFilter}
              className={selectClassName}
            >
              <option value="all">All actions</option>
              {ACTION_VALUES.map((value) => (
                <option key={value} value={value} className="capitalize">
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="actor"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Actor
            </label>
            <select
              id="actor"
              name="actor"
              defaultValue={actorFilter}
              className={selectClassName}
            >
              <option value="all">All actors</option>
              {users.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.email ?? user.user_id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="from"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={fromDate}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="to"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toDate}
              className={selectClassName}
            />
          </div>

          <Button type="submit" variant="outline">
            Filter
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/portal/administration/audit-log" />}
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load the audit log. Please try again.
            </p>
          ) : !entries || entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">
              No entries match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key}>
                      <Link
                        href={sortHref(column.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.label}
                        <SortIcon column={column.key} />
                      </Link>
                    </TableHead>
                  ))}
                  <TableHead>Record</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const auditRow: AuditLogRow = {
                    id: entry.id,
                    table_name: entry.table_name,
                    record_id: entry.record_id,
                    action: entry.action,
                    occurred_at: entry.occurred_at,
                    actor_label: entry.actor_id
                      ? (actorEmailById.get(entry.actor_id) ?? entry.actor_id)
                      : "System",
                    old_data: entry.old_data as Record<string, unknown> | null,
                    new_data: entry.new_data as Record<string, unknown> | null,
                  };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {dateTimeFormatter.format(new Date(entry.occurred_at))}
                      </TableCell>
                      <TableCell>
                        {TABLE_LABELS[entry.table_name] ?? entry.table_name}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={entry.action} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.record_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {auditRow.actor_label}
                      </TableCell>
                      <TableCell className="text-right">
                        <AuditLogDetailSheet row={auditRow} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {entries && entries.length > 0 && (
        <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
      )}
    </>
  );
}
