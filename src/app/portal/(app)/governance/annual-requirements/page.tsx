import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { AnnualRequirementsChecklist } from "./annual-requirements-checklist";
import type { AnnualRequirement } from "./annual-requirements-actions";
import type { PersonListItem } from "../../people/actions";

const REQUIREMENT_SELECT =
  "id, name, due_date, status, completed_at, external_link, body_text, responsible:people!responsible_person_id(id, name, email, phone)";

export default async function AnnualRequirementsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: requirements }, { data: people }] = await Promise.all([
    supabase
      .from("annual_requirements")
      .select(REQUIREMENT_SELECT)
      .order("due_date", { ascending: true }),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor")
      .order("name", { ascending: true }),
  ]);

  return (
    <>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Annual Requirements
      </h1>

      <div className="mt-6">
        <AnnualRequirementsChecklist
          requirements={(requirements ?? []) as unknown as AnnualRequirement[]}
          people={(people ?? []) as PersonListItem[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
