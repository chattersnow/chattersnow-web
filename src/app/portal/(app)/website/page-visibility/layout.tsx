import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * `system_settings:manage`, for the reason given in full on
 * `website/page-layout/layout.tsx`: the resource a panel's writes require did
 * not change when #990 moved the panel, and this is the page the board reaches
 * the Website section for.
 */
export default async function WebsitePageVisibilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "system_settings",
    "manage",
    "Page visibility",
  );
  return children;
}
