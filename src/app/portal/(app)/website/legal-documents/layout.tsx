import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * `system_settings:manage`, for the reason given in full on
 * `website/page-layout/layout.tsx`: putting a document in force is an
 * `app_settings` write, and `writeAppSetting` checks that resource whichever
 * section the panel is rendered in.
 */
export default async function WebsiteLegalDocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "system_settings",
    "manage",
    "Legal documents",
  );
  return children;
}
