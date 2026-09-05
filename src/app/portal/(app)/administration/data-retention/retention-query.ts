import { pageRange } from "@/lib/pagination";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RetentionParams } from "./retention-params";

export type RetentionPolicyRow = {
  policy_key: string;
  label: string;
  period: string;
  secondary_period: string | null;
  mode: "off" | "dry_run" | "enforce";
  description: string;
  updated_at: string;
  updated_by: string | null;
};

export type RetentionRunTableRow = {
  id: string;
  run_id: string;
  policy_key: string;
  table_name: string;
  action: string;
  row_count: number;
  sample_ids: string[];
  subject_person_id: string | null;
  error: string | null;
};

export type RetentionRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  as_of: string;
  dry_run: boolean;
  trigger: "cron" | "manual" | "request";
  triggered_by: string | null;
  reason: string | null;
  status: "running" | "succeeded" | "partial" | "failed";
  error: string | null;
};

export async function fetchRetentionPolicies(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const { data, error } = await supabase
    .from("retention_policies")
    .select(
      "policy_key, label, period, secondary_period, mode, description, updated_at, updated_by",
    )
    .order("label", { ascending: true });

  return { policies: (data ?? []) as RetentionPolicyRow[], error };
}

export async function fetchRetentionRuns(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: RetentionParams,
) {
  const { offset, to } = pageRange(filters.page);
  const { data, error, count } = await supabase
    .from("retention_runs")
    .select(
      "id, started_at, finished_at, as_of, dry_run, trigger, triggered_by, reason, status, error",
      { count: "exact" },
    )
    .order("started_at", { ascending: false })
    .range(offset, to);

  return { runs: (data ?? []) as RetentionRunRow[], error, count };
}

/**
 * The per-table counts for the runs on the current page, fetched in one query
 * rather than one per run. Returned grouped by run so the table can render a
 * run and its breakdown together.
 */
export async function fetchRetentionRunTables(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  runIds: string[],
) {
  if (runIds.length === 0) {
    return { byRun: new Map<string, RetentionRunTableRow[]>(), error: null };
  }

  const { data, error } = await supabase
    .from("retention_run_tables")
    .select(
      "id, run_id, policy_key, table_name, action, row_count, sample_ids, subject_person_id, error",
    )
    .in("run_id", runIds)
    .order("policy_key", { ascending: true });

  const byRun = new Map<string, RetentionRunTableRow[]>();
  for (const row of (data ?? []) as RetentionRunTableRow[]) {
    const existing = byRun.get(row.run_id);
    if (existing) existing.push(row);
    else byRun.set(row.run_id, [row]);
  }

  return { byRun, error };
}
