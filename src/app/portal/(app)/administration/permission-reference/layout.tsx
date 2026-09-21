import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The reference is for whoever edits the permissions matrix, so it is gated on
 * the same grant the matrix is: `administration:manage`. The Administration
 * layout above also admits `system_settings:manage` (a board member reaching
 * Organization Settings), which is why this re-checks rather than inheriting.
 */
export default async function PermissionReferenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "administration",
    "manage",
    "Permission reference",
  );
  return children;
}
