import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { BylawsTable } from "./bylaws-table";
import type { Bylaws } from "./bylaws-actions";

const BYLAWS_SELECT =
  "id, version, effective_date, amendment_summary, external_link, body_text";

export default async function BylawsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const { data: bylaws } = await supabase
    .from("bylaws")
    .select(BYLAWS_SELECT)
    .order("effective_date", { ascending: false });

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Bylaws
      </h1>

      <div className="mt-6">
        <BylawsTable
          bylaws={(bylaws ?? []) as unknown as Bylaws[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
