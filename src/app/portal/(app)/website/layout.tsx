import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/website.
 *
 * Unchanged by the move out of Administration (#944): `site_content:view` was
 * always this section's own gate, and the only one in Administration that
 * admitted a reader holding nothing else -- which is part of why the section
 * did not belong there. Editing is still gated on `site_content:manage` per
 * page, via the `canEdit` prop.
 */
export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "site_content", "view", "Website");
  return children;
}
