import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The inner half of the two gates over /portal/volunteers (#1360). The section
 * layout admits `volunteer_screening` as well as `volunteers`, so this page
 * has to say for itself that Screening alone is not enough to reach it.
 */
export default async function VolunteerParticipationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "volunteers", "view", "Volunteers");
  return children;
}
