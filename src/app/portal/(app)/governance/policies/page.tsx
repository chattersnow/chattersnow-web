import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PoliciesTable } from "./policies-table";
import { NewPolicyDialog } from "./new-policy-dialog";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Policies
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        {canManage && <NewPolicyDialog />}
      </div>

      <div className="mt-6">
        <PoliciesTable
          policies={(policies ?? []) as unknown as Policy[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
