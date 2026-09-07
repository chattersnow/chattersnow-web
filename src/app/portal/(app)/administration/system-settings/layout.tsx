import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function AdministrationSystemSettingsLayout({
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
    "System Settings",
  );
  return children;
}
