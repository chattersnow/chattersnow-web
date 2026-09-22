import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The conduct area's gate (#687).
 *
 * `view`, not `manage`: a reviewer assigned to a case holds view and nothing
 * else, and the page is where they read it. What they can actually see is
 * decided one row at a time by `can_see_conduct_report()` in the database, so
 * this guard is about the door rather than about the contents -- a view holder
 * with no assignment opens the page and finds an empty queue.
 */
export default async function ConductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "conduct_reports", "view", "Conduct");
  return children;
}
