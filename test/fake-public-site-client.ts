/**
 * A stand-in for the server Supabase client on the public site, for DOM
 * tests that render a page without a database.
 *
 * Every public page reads `public_site_images` and, since #707 Phase 4,
 * `getPublicSite()` -- the tenant (`public_tenant`), the branding
 * (`public_branding`) and the copy (`public_site_content`). The fake answers
 * each view with what the test supplies and nothing for the rest, so a page
 * renders the registry defaults exactly as it would for a tenant that has set
 * nothing.
 */
export function fakePublicSiteClient({
  siteImages = {},
  content = {},
  tenant = null,
}: {
  siteImages?: Record<string, string>;
  content?: Record<string, unknown>;
  tenant?: { id: string; name: string; slug: string } | null;
} = {}) {
  const rows: Record<string, unknown[]> = {
    public_site_images: Object.entries(siteImages).map(([slot, value]) => ({
      slot,
      value,
    })),
    public_site_content: Object.entries(content).map(([key, value]) => ({
      key,
      value,
    })),
    public_branding: [],
    public_tenant: tenant ? [tenant] : [],
  };

  return {
    from: (table: string) => {
      const data = rows[table] ?? [];
      const result = { data, error: null };
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (
          resolve: (value: typeof result) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  };
}
