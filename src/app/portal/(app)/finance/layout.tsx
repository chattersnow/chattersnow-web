import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/finance.
 *
 * It admits the two Reimbursements resources as well as the two Finance ones,
 * because Reimbursements is its own section that happens to live under this
 * URL prefix -- and, since #900, its own **module**. Without them, a tenant
 * sold Reimbursements and not Finance got a Reimbursements link in the sidebar
 * (nav.ts gates it on exactly these two) that bounced off this layout to the
 * dashboard: a dead end the app itself rendered, which is the failure #903
 * exists to remove. The same hole was already reachable without modules, by a
 * role holding reimbursements:manage and no finance access; nobody had that
 * shape, so nobody hit it.
 *
 * `finance_approvals:manage` is here for the same reason: the sidebar shows
 * Expenses to an approver holding it, expenses/layout.tsx admits it, and this
 * layout was the only thing in the way. `sales:view` (#907) is the newest
 * instance: `event_coordinator` holds `sales:manage` and `finance:none`, and
 * without this line it would reach Products only by way of the unrelated
 * `reimbursements:manage` it happens to also hold.
 *
 * Widening here gives nothing away. Each child re-checks on its own --
 * reimbursements/layout.tsx wants the reimbursements pair, expenses/ the
 * finance pair, and donations/, revenue/ and reports/ their own -- so this is
 * the outer of two gates rather than the only one.
 */
export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "finance", level: "view" },
      { resource: "finance_reports", level: "view" },
      { resource: "finance_approvals", level: "manage" },
      { resource: "sales", level: "view" },
      { resource: "reimbursements", level: "manage" },
      { resource: "reimbursement_approvals", level: "manage" },
    ],
    "Finance",
  );
  return children;
}
