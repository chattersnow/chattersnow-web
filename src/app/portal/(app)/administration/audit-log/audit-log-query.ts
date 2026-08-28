import { pageRange } from "@/lib/pagination";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuditLogParams } from "./audit-log-params";

export type AuditLogEntry = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  actor_id: string | null;
  occurred_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export async function fetchAuditLogEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: AuditLogParams,
) {
  let query = supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, actor_id, occurred_at, old_data, new_data",
      { count: "exact" },
    )
    .order(filters.sort, { ascending: filters.dir === "asc" })
    .order("id", { ascending: true });

  if (filters.table !== "all") query = query.eq("table_name", filters.table);
  if (filters.action !== "all") query = query.eq("action", filters.action);
  if (filters.actor !== "all") query = query.eq("actor_id", filters.actor);
  if (filters.from)
    query = query.gte("occurred_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to)
    query = query.lte("occurred_at", `${filters.to}T23:59:59.999Z`);

  const { offset, to } = pageRange(filters.page);
  const { data: entries, error, count } = await query.range(offset, to);

  return { entries: entries as AuditLogEntry[] | null, error, count };
}
