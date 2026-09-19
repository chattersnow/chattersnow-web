import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * The gate on /portal/administration/automatic-replies.
 *
 * `system_settings:manage` alone, not the union Administration's own layout
 * carries: that union exists so a board member holding nothing else still
 * reaches Organization Settings, and this page's table is governed by exactly
 * the same permission (`auto_reply_templates`'s RLS policies, #1233). Naming
 * the narrower of the two here keeps the sidebar entry, the route and the
 * row-level policies saying one thing.
 */
export default async function AutomaticRepliesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(
    supabase,
    "system_settings",
    "manage",
    "Automatic Replies",
  );
  return children;
}
