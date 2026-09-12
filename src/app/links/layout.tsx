import { notFound } from "next/navigation";
import { BrandStyle } from "@/components/brand-style";
import { SkipLink } from "@/components/skip-link";
import { requireVisiblePage } from "@/lib/page-visibility";
import { getPublicSite } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The link-in-bio page's shell (#937).
 *
 * Deliberately outside `src/app/(public)`, and this file is the reason: that
 * group's layout is the site header, the full nav and the three-zone footer,
 * and a visitor who has just tapped one link in an Instagram bio should not
 * land on a page whose header already offers them the same six destinations.
 * Route groups do not affect the URL, so `/links` is `/links` either way.
 *
 * What it still owes the rest of the site is here: the tenant's colours, the
 * skip link, the same 404 on a host no tenant claims, and the visibility gate.
 */
export default async function LinksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);

  // Same rule and same reason as the public layout: only `unresolved`, never
  // `unavailable`. A host no tenant claims has nothing to serve, but 404ing a
  // failed read would take every tenant's page down over a database blip.
  if (site.status === "unresolved") {
    notFound();
  }

  await requireVisiblePage("links");

  return (
    <>
      <BrandStyle branding={site.branding} />
      <SkipLink href="#main-content" />
      <div className="rainbow-strip" />
      {/* `app-shell` paints the tenant's background across the whole viewport
          (it is `flex: 1` inside the root layout's flex column); the column
          inside it is deliberately narrow, because this page is read on a
          phone that has just left Instagram. */}
      <div className="app-shell flex justify-center px-6 py-12">
        <main
          id="main-content"
          tabIndex={-1}
          className="flex w-full max-w-sm flex-col items-center"
        >
          {children}
        </main>
      </div>
    </>
  );
}
