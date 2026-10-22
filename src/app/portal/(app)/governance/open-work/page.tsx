import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  GOVERNANCE_OPEN_WORK_KINDS,
  getGovernanceOpenWork,
} from "@/lib/portal/governance-open-work";
import { parseTaskFilters } from "@/lib/portal/task-list";
import { OpenWorkTable } from "./open-work-table";
import type { PersonListItem } from "../../people/actions";

export const metadata: Metadata = {
  title: "Open work",
};

export default async function OpenWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const filters = parseTaskFilters(
    await searchParams,
    GOVERNANCE_OPEN_WORK_KINDS,
  );
  const permissions = await getCurrentUserPermissions(supabase);
  // Always true today: governance/layout.tsx already requires
  // governance:manage and there is no view-only governance role. Asked
  // anyway so the rows say what the viewer may do rather than assume it.
  const canEdit = hasPermission(permissions, "governance", "manage");

  const [openWork, { data: people }] = await Promise.all([
    getGovernanceOpenWork(supabase, filters, { canEdit }),
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
          Open work
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-3 max-w-3xl">
        Action items, nonprofit status milestones, annual requirements, grant
        deadlines and partnership next steps in one list, overdue first.
      </p>

      <div className="mt-6">
        <OpenWorkTable
          rows={openWork.rows}
          filters={filters}
          owners={openWork.owners}
          today={openWork.today}
          people={(people ?? []) as PersonListItem[]}
        />
      </div>
    </>
  );
}
