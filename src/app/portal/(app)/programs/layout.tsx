import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(supabase, [
    { resource: "programs", level: "view" },
    { resource: "programs_reports", level: "view" },
  ]);
  return children;
}
