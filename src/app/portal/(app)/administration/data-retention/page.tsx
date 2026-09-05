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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Data Retention</h1>
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed">
          The privacy policy tells people how long we keep what they give us.
          These are the rules that make that true, and the record of what each
          run actually did. Donation and financial records are exempt, and a
          person is kept whenever any record still depends on them.
        </p>
      </header>

      <RetentionPoliciesPanel policies={policies} />

      <section className="space-y-4">
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
    </div>
  );
}
