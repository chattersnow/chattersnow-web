import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/administration.
 *
 * This used to be a six-resource union, because four sections filed here were
 * reachable without `administration` itself and each had to be admitted by
 * name -- twice after the sidebar rendered a link this layout refused (#903).
 * Three of them have since left for their own top-level sections: Access
 * Management in #943 (a peer module rather than part of Administration), Site
 * Content in #944 (website authoring), and Platform in #945 (a different
 * product level -- every organization, not this one).
 *
 * What is left is two resources for the two audiences that actually
 * administer an organization: an `admin`, and a board member, who holds
 * `system_settings:manage` and reaches Organization Settings alone. Each child still
 * re-checks on its own, so this stays the outer of two gates.
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
    ],
    "Administration",
  );
  return children;
}
