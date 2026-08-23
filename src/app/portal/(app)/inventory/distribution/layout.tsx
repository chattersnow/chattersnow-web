import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function InventoryDistributionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(supabase, [
    { resource: "inventory", level: "view" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  return children;
}
