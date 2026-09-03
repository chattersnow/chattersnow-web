import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildHref, totalPagesFor } from "@/lib/pagination";
import { listUsersAction } from "../users/actions";
import { AuditLogFilterForm } from "./audit-log-filter-form";
import { parseAuditLogParams, type SortColumn } from "./audit-log-params";
import { AuditLogTable } from "./audit-log-table";
import { fetchAuditLogEntries } from "./audit-log-query";

type AuditLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Audit Log",
};

export default async function AuditLogPage({
  searchParams,
}: AuditLogPageProps) {
  const supabase = await createSupabaseServerClient();
  const filters = parseAuditLogParams(await searchParams);

  const usersResult = await listUsersAction();
  const users = "data" in usersResult ? usersResult.data : [];
  const actorEmailById = new Map(
    users.map((user) => [user.user_id, user.email ?? user.user_id]),
  );

  const { entries, error, count } = await fetchAuditLogEntries(
    supabase,
    filters,
  );

  const filterParams = new URLSearchParams();
  if (filters.table !== "all") filterParams.set("table", filters.table);
  if (filters.action !== "all") filterParams.set("action", filters.action);
  if (filters.actor !== "all") filterParams.set("actor", filters.actor);
  if (filters.from) filterParams.set("from", filters.from);
  if (filters.to) filterParams.set("to", filters.to);

  function sortHref(column: SortColumn) {
    const nextDir =
      filters.sort === column && filters.dir === "desc" ? "asc" : "desc";
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/administration/audit-log", filterParams, {
      sort: filters.sort,
      dir: filters.dir,
      page: nextPage,
    });
  }

  const hasActiveFilters =
    filters.table !== "all" ||
    filters.action !== "all" ||
    filters.actor !== "all" ||
    !!filters.from ||
    !!filters.to;

  const totalPages = totalPagesFor(count);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Audit Log
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <AuditLogFilterForm
        filters={filters}
        users={users}
        hasActiveFilters={hasActiveFilters}
      />

      <AuditLogTable
        entries={entries}
        error={error}
        sort={filters.sort}
        dir={filters.dir}
        sortHref={sortHref}
        actorEmailById={actorEmailById}
        page={filters.page}
        totalPages={totalPages}
        pageHref={pageHref}
      />
    </>
  );
}
