import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Publications and each issue's editor (#1472), on the section's own resource.
 * `website/layout.tsx` admits `publications:view` too, so a role granted the
 * publication and nothing else of the website reaches exactly this.
 */
export default async function WebsitePublicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "publications", "view", "Publications");
  return children;
}
