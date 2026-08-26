import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PoliciesTable } from "./policies-table";
import type { Policy } from "./policies-actions";

const POLICY_SELECT =
  "id, name, category, effective_date, version, external_link, body_text";

export default async function PoliciesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const { data: policies } = await supabase
    .from("policies")
    .select(POLICY_SELECT)
    .order("name", { ascending: true })
    .order("effective_date", { ascending: false });

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Policies
      </h1>

      <div className="mt-6">
        <PoliciesTable
          policies={(policies ?? []) as unknown as Policy[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
