import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPublicBranding,
  getPublicTenant,
  type Branding,
  type PublicTenant,
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
  /** Null when no tenant resolves; the site then renders the defaults. */
  tenant: PublicTenant | null;
  /** The organization's name for headings, titles and the copyright line. */
  name: string;
  branding: Branding;
  content: SiteContent;
};

export const DEFAULT_SITE_NAME = "Chatter Snow";

export const getPublicSite = cache(
  async (supabase: SupabaseClient): Promise<PublicSite> => {
    const [tenant, branding, contentResult] = await Promise.all([
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

    return {
      tenant,
      name: tenant?.name ?? DEFAULT_SITE_NAME,
      branding,
      content: resolveSiteContent(
        (contentResult.data ?? []) as SiteContentRow[],
      ),
    };
  },
);

/** `<title>` for a public page: "Page | Organization". */
export function publicTitle(site: PublicSite, page: string): string {
  return `${page} | ${site.name}`;
}
