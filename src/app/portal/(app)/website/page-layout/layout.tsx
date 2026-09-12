import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * `system_settings:manage`, not `site_content:view` (#990).
 *
 * The section above admits either, so that a board member holding only
 * `system_settings:manage` can reach the three settings pages that moved here
 * without being granted the CMS. Each of those three then names the resource
 * its own writes actually require: `writeAppSetting` checks
 * `system_settings:manage`, so a reader admitted on `site_content:view` alone
 * would get a page whose every switch fails to save.
 *
 * The resource did not change because the page moved. What changed is which
 * section it is rendered in, and the gate says so in the one place that can.
 */
export default async function WebsitePageLayoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "system_settings", "manage", "Layout");
  return children;
}
