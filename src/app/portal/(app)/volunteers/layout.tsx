import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/volunteers.
 *
 * It admits `volunteer_screening` as well as `volunteers` because Screening
 * levels (#1360) is its own resource living under this URL prefix -- the shape
 * finance/layout.tsx has carried since #903. Without it, a safeguarding lead
 * holding screening and nothing else gets a Screening link in the sidebar that
 * bounces to the dashboard: a dead end the app itself rendered.
 *
 * Widening here gives nothing away, because each child re-checks on its own --
 * roles/, participation/ and applications/ want `volunteers:view` and
 * screening/ wants its own resource. This is the outer of two gates rather
 * than the only one.
 */
export default async function VolunteersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "volunteers", level: "view" },
      { resource: "volunteer_screening", level: "view" },
    ],
    "Volunteers",
  );
  return children;
}
