import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyRole } from "@/lib/auth/roles";

export default async function InventoryDistributionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  await requireAnyRole(supabase, ["admin", "volunteer"]);
  return children;
}
