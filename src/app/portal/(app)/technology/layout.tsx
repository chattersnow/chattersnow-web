import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/technology.
 *
 * `access_management` is its own module in the entitlement catalog, so the
 * gate is its two resources at `view` and nothing else. It used to admit
 * `administration:manage` as well, the way the Administration sections do, but
 * that resource belongs to the core `administration` module and cannot be
 * switched off -- so a tenant with Access Management disabled still showed its
 * admins the whole section. Admins lose nothing by dropping it: the admin role
 * holds access_management_assets:manage outright, which my_permissions()
 * reports as `none` exactly when the module is off.
 */
export default async function TechnologyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "access_management_assets", level: "view" },
      { resource: "access_management_reviews", level: "view" },
    ],
    "Technology",
  );
  return children;
}
