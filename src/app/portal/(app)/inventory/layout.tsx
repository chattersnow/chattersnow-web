import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "inventory", level: "view" },
      { resource: "inventory_intake", level: "manage" },
      { resource: "inventory_reports", level: "view" },
    ],
    "Inventory",
  );
  return children;
}
