import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function FinanceReimbursementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(supabase, [
    { resource: "reimbursements", level: "manage" },
    { resource: "reimbursement_approvals", level: "manage" },
  ]);
  return children;
}
