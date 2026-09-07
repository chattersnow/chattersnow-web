import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function FinanceExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "finance", level: "manage" },
      { resource: "finance_approvals", level: "manage" },
    ],
    "Expenses",
  );
  return children;
}
