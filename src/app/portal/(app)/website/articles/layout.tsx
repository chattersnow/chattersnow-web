import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Articles, the article editor and Content Packs, all on `site_content:view`.
 *
 * New with #990 rather than new policy: this was the section gate's job until
 * that ticket widened `website/layout.tsx` to admit `system_settings:manage`
 * as well, so that the three moved settings panels could live here. Without
 * this file a board member would reach the article editor -- the CMS access
 * the widening exists to avoid granting them.
 *
 * Content Packs needs `platform_tenants:manage` on top and enforces that
 * itself with `notFound()`, which is why this says only what the whole
 * subtree shares.
 */
export default async function WebsiteArticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "site_content", "view", "Articles");
  return children;
}
