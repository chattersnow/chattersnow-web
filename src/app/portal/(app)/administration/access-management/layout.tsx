import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function AdministrationAccessManagementLayout({
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
    "Access Management",
  );
  return children;
}
