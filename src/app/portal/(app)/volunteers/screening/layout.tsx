import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Screening's own gate (#1360). The section layout above admits `volunteers`
 * as well, so this route has to say for itself that the wider grant is not a
 * way in.
 */
export default async function VolunteerScreeningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "volunteer_screening",
    "view",
    "Screening levels",
  );
  return children;
}
