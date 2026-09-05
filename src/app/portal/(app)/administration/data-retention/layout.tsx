import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export default async function AdministrationDataRetentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "administration",
    "manage",
    "Data Retention",
  );
  return children;
}
