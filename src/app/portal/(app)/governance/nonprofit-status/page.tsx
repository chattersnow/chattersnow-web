import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { NonprofitStatusChecklist } from "./nonprofit-status-checklist";
import type { Milestone } from "./nonprofit-status-actions";
import type { PersonListItem } from "../../people/actions";

const MILESTONE_SELECT =
  "id, description, phase, due_date, status, owner:people!owner_person_id(id, name, email, phone)";

export default async function NonprofitStatusPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: milestones }, { data: people }] = await Promise.all([
    supabase
      .from("nonprofit_status_milestones")
      .select(MILESTONE_SELECT)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor")
      .order("name", { ascending: true }),
  ]);

  return (
    <>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Nonprofit Status
      </h1>

      <div className="mt-6">
        <NonprofitStatusChecklist
          milestones={(milestones ?? []) as unknown as Milestone[]}
          people={(people ?? []) as PersonListItem[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
