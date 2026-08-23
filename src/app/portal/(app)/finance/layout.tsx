import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(supabase, [
    { resource: "finance", level: "view" },
    { resource: "finance_reports", level: "view" },
  ]);
  return children;
}
