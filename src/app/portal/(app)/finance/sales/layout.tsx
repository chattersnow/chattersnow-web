import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * `view`, not `manage`: the ledger is a read of what was sold, and the pages
 * under it that write -- the register and the Products admin -- require
 * `manage` in their own layouts.
 */
export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "sales", "view", "Sales");
  return children;
}
