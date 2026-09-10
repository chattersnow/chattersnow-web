import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Its own section rather than a page under /portal/events, so that a curator
 * granted `artwork_submissions` and nothing else can actually reach it -- the
 * events layout gates the whole subtree on `events:view`.
 */
export default async function ArtworkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "artwork_submissions", "view", "Artwork");
  return children;
}
