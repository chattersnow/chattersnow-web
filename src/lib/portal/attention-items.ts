import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingApprovalItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};
export type PendingApprovalsSummary = { items: PendingApprovalItem[] };

export async function getPendingApprovalsSummary(
  supabase: SupabaseClient,
  options: { canSeeExpenseApprovals: boolean },
): Promise<PendingApprovalsSummary> {
  const items: PendingApprovalItem[] = [];

  if (options.canSeeExpenseApprovals) {
    const { data: pendingExpenseCount } = await supabase.rpc(
      "count_pending_event_expense_approvals",
    );
    const count = pendingExpenseCount ?? 0;
    if (count > 0) {
      items.push({
        key: "expense_approvals",
        label: "Expense approvals",
        count,
        href: "/portal/finance/expenses?status=submitted",
      });
    }
  }

  return { items };
}
