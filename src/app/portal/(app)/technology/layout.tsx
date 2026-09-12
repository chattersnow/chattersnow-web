import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/technology.
 *
 * Unchanged by the move out of Administration (#943): `access_management` was
 * always its own module in the entitlement catalog, admitting its two
 * resources at `view`, and `administration:manage` still reaches it the way it
 * reaches every other section an admin holds. Nobody gains or loses access --
 * the section is simply no longer behind Administration's disclosure.
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
      { resource: "administration", level: "manage" },
      { resource: "access_management_assets", level: "view" },
      { resource: "access_management_reviews", level: "view" },
    ],
    "Technology",
  );
  return children;
}
