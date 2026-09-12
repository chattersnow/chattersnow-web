import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/platform.
 *
 * Whole gate, not half of one, and unchanged by the move out of
 * Administration (#945). my_permissions() reports `platform_tenants` as `none`
 * unless is_platform_operator() holds (#795), so this check carries the plan
 * and membership-kind conditions too and refuses in the same breath as the
 * RPCs would. The database still decides -- this only asks it earlier, so a
 * typed URL lands on the dashboard's "denied" explanation rather than on a
 * page whose every action is refused.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "platform_tenants", "manage", "Platform");
  return children;
}
