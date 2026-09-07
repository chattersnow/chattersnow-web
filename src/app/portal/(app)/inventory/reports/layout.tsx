import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export default async function InventoryReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "inventory_reports",
    "view",
    "Inventory Reports",
  );
  return children;
}
