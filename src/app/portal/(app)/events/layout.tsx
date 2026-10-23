import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import { isEventGuest } from "@/lib/auth/event-access";

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  // A guest reaches Events through their grants (#1688): RLS shows them only
  // the granted events, and an ungranted one is a 404 on the detail page.
  if (
    !hasPermission(permissions, "events", "view") &&
    !(await isEventGuest(supabase, permissions))
  ) {
    await requirePermission(supabase, "events", "view", "Events");
  }
  return children;
}
