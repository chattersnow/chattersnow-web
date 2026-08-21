import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/roles";

export default async function InventoryReportsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  await requireAnyRole(supabase, ["admin", "finance"]);
  return children;
}
