import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/administration.
 *
 * It is the union of what its children admit rather than a narrower gate of
 * its own, because sections under this prefix are reachable without
 * `administration` itself and were links the sidebar rendered and this layout
 * refused (#903). Platform admits `platform_tenants:manage` alone, which is
 * deliberately the whole operator gate -- my_permissions() reports that
 * resource as `none` unless is_platform_operator() holds.
 *
 * Two sections used to widen this further and have since left: Access
 * Management for its own top-level section in #943, being a peer module
 * rather than part of Administration, and Site Content for the Website
 * section in #944, being website authoring rather than administration. That
 * is why neither `access_management_*` nor `site_content` appears here.
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
      { resource: "platform_tenants", level: "manage" },
    ],
    "Administration",
  );
  return children;
}
