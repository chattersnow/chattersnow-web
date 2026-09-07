import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildHref, PAGE_SIZE, totalPagesFor } from "@/lib/pagination";
import { Pagination } from "@/components/ui/pagination";
import { listUsersAction } from "../users/actions";
import { parseRetentionParams } from "./retention-params";
import {
  fetchRetentionPolicies,
  fetchRetentionRunTables,
  fetchRetentionRuns,
} from "./retention-query";
import { RetentionPoliciesPanel } from "./retention-policies-panel";
import { RetentionRunsTable } from "./retention-runs-table";

type DataRetentionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Data Retention",
};

export default async function DataRetentionPage({
  searchParams,
}: DataRetentionPageProps) {
  const supabase = await createSupabaseServerClient();
  const filters = parseRetentionParams(await searchParams);

  const [{ policies }, { runs, count }, usersResult] = await Promise.all([
    fetchRetentionPolicies(supabase),
    fetchRetentionRuns(supabase, filters),
    listUsersAction(),
  ]);

  const { byRun } = await fetchRetentionRunTables(
    supabase,
    runs.map((run) => run.id),
  );

  const users = "data" in usersResult ? usersResult.data : [];
  const actorEmailById = new Map(
    users.map((user) => [user.user_id, user.email ?? user.user_id]),
  );

  const totalPages = totalPagesFor(count, PAGE_SIZE);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Data Retention
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The retention periods published at <code>/privacy</code>, and the record
        of what each run actually did.
      </p>

      <div className="mt-6">
        <RetentionPoliciesPanel policies={policies} />
      </div>

      <section className="mt-6 space-y-4">
        <h2 className="font-semibold">Run history</h2>
        <RetentionRunsTable
          runs={runs}
          countsByRun={byRun}
          actorEmailById={actorEmailById}
        />
        {runs.length > 0 && (
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            count={count}
            hrefFor={(nextPage) =>
              buildHref(
                "/portal/administration/data-retention",
                new URLSearchParams(),
                { page: nextPage },
              )
            }
          />
        )}
      </section>
    </>
  );
}
