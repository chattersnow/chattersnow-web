import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * `system_settings:manage`, the same gate as Legal documents next door and for
 * the same reason: these answers are `app_settings` rows, and `writeAppSetting`
 * checks that resource whichever section the panel is rendered in.
 */
export default async function WebsiteGiveawayRulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "system_settings",
    "manage",
    "Giveaway rules",
  );
  return children;
}
