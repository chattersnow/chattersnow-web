import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export default async function AdministrationPlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  // The permission is only half the gate -- the RPCs also require the caller to
  // be a full member of a tenant on the internal plan (#707 Phase 5c). This
  // guard is the cheap half, so the page does not render for someone who would
  // then be refused by every action on it; the database decides.
  await requirePermission(supabase, "platform_tenants", "manage", "Platform");
  return children;
}
