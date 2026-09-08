import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPublicBranding,
  getPublicTenant,
  type Branding,
  type PublicTenant,
  type PublicTenantResult,
} from "@/lib/branding";
import {
  resolveSiteContent,
  type SiteContent,
  type SiteContentRow,
} from "@/lib/site-content";

/**
 * Everything the public site needs to know about the organization it is
 * serving: the tenant the request host resolved to, its branding and its
 * copy. One cached read per request -- the layout, `generateMetadata` and
 * the page all ask for it.
 */
export type PublicSite = {
  /**
   * Which of the three outcomes the host resolution had (#795 Phase 4).
   * `unresolved` is the only one a caller may 404 on -- see
   * `PublicTenantResult` in `@/lib/branding` for why `unavailable` is not.
   */
  status: PublicTenantResult["status"];
  /** Null unless `status` is `resolved`; the site then renders the defaults. */
  tenant: PublicTenant | null;
  /**
   * The organization's name for headings, titles and the copyright line, or
   * null when there is no organization to name -- an unresolved host, or a
   * tenant read that failed. Nullable rather than defaulted (#795 Phase 3):
   * the fallback used to be Chatter Snow's name, which meant a database blip
   * on a customer's domain briefly published a different nonprofit's name in
   * their header and their tab. There is no honest substitute for a name we
   * could not read, so nothing is named.
   */
  name: string | null;
  branding: Branding;
  content: SiteContent;
};

/**
 * Title for a page that belongs to no organization (#795 Phase 4).
 *
 * The root layout's metadata is a fallback that the public and portal layouts
 * both replace, so what actually reaches a browser with this title is the
 * built-in 404 for an unmatched path -- and on a host no tenant claims, that
 * is every path. Naming an organization there is the leak the 404 exists to
 * close, so this names none.
 *
 * Not simply omitted: a page with no `<title>` fails axe's `document-title`
 * rule, which `bun run test:a11y:check` enforces.
 */
export const PLATFORM_TITLE = "Page not found";

/**
 * Title for a public page on a host no tenant claims. Shared by the public
 * layout's metadata and `publicTitle()` so the two cannot drift -- a page that
 * sets its own metadata overrides the layout's, so both have to agree.
 */
export const NOT_FOUND_TITLE = "Not found";

export const getPublicSite = cache(
  async (supabase: SupabaseClient): Promise<PublicSite> => {
    const [tenantResult, branding, contentResult] = await Promise.all([
      getPublicTenant(supabase),
      getPublicBranding(supabase),
      supabase.from("public_site_content").select("key, value"),
    ]);

    if (contentResult.error) {
      // Same stance as page-visibility: fall back to the defaults, but say so,
      // because a silent fallback looks like the editor refusing to save.
      console.error(
        "[public-site] could not read public_site_content; rendering the default copy",
        contentResult.error,
      );
    }

    const tenant =
      tenantResult.status === "resolved" ? tenantResult.tenant : null;

    return {
      status: tenantResult.status,
      tenant,
      name: tenant?.name ?? null,
      branding,
      content: resolveSiteContent(
        (contentResult.data ?? []) as SiteContentRow[],
      ),
    };
  },
);

/**
 * `<title>` for a public page: "Page | Organization".
 *
 * Except on a host no tenant claims, where there is no organization to name
 * (#795 Phase 4). The layout 404s that request, but a page's own
 * `generateMetadata` still runs and wins over the layout's -- so without this,
 * the 404 served on someone else's domain is titled
 * "Gear | <whichever organization the defaults name>". Caught by
 * `e2e/unresolved-host.spec.ts` rather than by reasoning about it.
 */
export function publicTitle(site: PublicSite, page: string): string {
  if (site.status === "unresolved") return NOT_FOUND_TITLE;
  // Just the page when there is no organization to name -- "Gear" rather than
  // "Gear | " or, as it was, "Gear | <somebody else's nonprofit>".
  return site.name ? `${page} | ${site.name}` : page;
}
