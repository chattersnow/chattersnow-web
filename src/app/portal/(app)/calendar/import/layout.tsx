import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export default async function CalendarImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "content_calendar",
    "manage",
    "Calendar Import",
  );
  return children;
}
