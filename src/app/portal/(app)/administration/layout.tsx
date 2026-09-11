import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/administration.
 *
 * It is the union of what its children admit rather than a narrower gate of
 * its own, because two sections under this prefix are reachable without
 * `administration` itself and both were links the sidebar rendered and this
 * layout refused (#903). Access Management is its own **module** since #900
 * and admits its two resources at `view`; Platform admits
 * `platform_tenants:manage` alone, which is deliberately the whole operator
 * gate -- my_permissions() reports that resource as `none` unless
 * is_platform_operator() holds.
 *
 * Widening here gives nothing away. Every child of this route re-checks on its
 * own (access-management/layout.tsx, platform/layout.tsx and the rest), so
 * this is the outer of two gates, and a reader let in by one section's
 * resource still gets nothing from any other section.
 */
export default async function AdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "administration", level: "manage" },
      { resource: "system_settings", level: "manage" },
      { resource: "site_content", level: "view" },
      { resource: "access_management_assets", level: "view" },
      { resource: "access_management_reviews", level: "view" },
      { resource: "platform_tenants", level: "manage" },
    ],
    "Administration",
  );
  return children;
}
