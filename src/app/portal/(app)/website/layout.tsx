import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/auth/permissions";

/**
 * The gate on everything under /portal/website.
 *
 * Was `site_content:view` alone -- always this section's own gate, and the
 * only one in Administration that admitted a reader holding nothing else,
 * which is part of why the section did not belong there (#944).
 *
 * #990 made it a union. Layout, Page visibility and Legal documents moved here
 * from System Settings, and Page visibility in particular is a board control:
 * the panel's copy says "hold content back until the board has approved it",
 * and `page-visibility.spec.ts` has a test named "a board member can hide a
 * section from the portal". But `board` holds `system_settings:manage` and no
 * `site_content` at all, so moving it naively would have taken the board's one
 * self-service control away.
 *
 * Widening this gate is the answer rather than granting `board`
 * `site_content:view`, which is the gate on the whole CMS -- the board would
 * have gained Pages, Articles and Content Packs in order to keep a publication
 * switch. Instead each route below names the resource it actually needs, and
 * `visibleNavItems` shows a board member exactly the two entries they hold.
 *
 * A two-resource union, and the Administration research (#943) was rude about
 * union gates. The difference: Administration's was six resources papering
 * over a misc drawer. This is two, and it states something true -- the Website
 * section is reachable by whoever writes the website *or* decides what of it
 * is published.
 *
 * Because this no longer proves `site_content:view` on its own, the CMS routes
 * under it say so themselves: `website/page.tsx` and `website/articles/
 * layout.tsx`. Without that a board member would reach the page editor.
 */
export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  await requireAnyPermission(
    supabase,
    [
      { resource: "site_content", level: "view" },
      { resource: "system_settings", level: "manage" },
    ],
    "Website",
  );
  return children;
}
