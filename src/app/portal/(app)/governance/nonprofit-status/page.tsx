import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTaskFilters } from "@/lib/portal/task-list";
import { resolveTaskFilterContext } from "@/lib/portal/task-filter-context";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { NonprofitStatusChecklist } from "./nonprofit-status-checklist";
import type { Milestone } from "./nonprofit-status-actions";
import type { PersonListItem } from "../../people/actions";

const MILESTONE_SELECT =
  "id, description, phase, due_date, status, notes, owner:people!nonprofit_status_milestones_owner_person_id_fkey(id, name, preferred_name, email, phone)";

export const metadata: Metadata = {
  title: "Nonprofit Status",
};

export default async function NonprofitStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  // Owner and due only (#1659); the checklist shows every status itself.
  const filters = parseTaskFilters(await searchParams, []);
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [filterContext, { data: milestones }, { data: people }] =
    await Promise.all([
      resolveTaskFilterContext(supabase, filters),
      supabase
        .from("nonprofit_status_milestones")
        .select(MILESTONE_SELECT)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, auth_user_id, has_portal_access",
        )
        .order("name", { ascending: true }),
    ]);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Nonprofit Status
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <NonprofitStatusChecklist
          milestones={(milestones ?? []) as unknown as Milestone[]}
          people={(people ?? []) as PersonListItem[]}
          canManage={canManage}
          filters={filters}
          filterContext={filterContext}
        />
      </div>
    </>
  );
}
