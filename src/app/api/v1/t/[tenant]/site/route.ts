import { publicRead, unwrap } from "@/lib/api/handler";
import { brandingFromRows } from "@/lib/branding";
import {
  getPageVisibility,
  getPublicTenantModules,
} from "@/lib/page-visibility";
import { resolveLayoutValues } from "@/lib/site-layout";

/**
 * Who this organization is and how its site is arranged: the tenant's name and
 * domain, its brand tokens, which sections it publishes, its layout choices
 * and which modules it has.
 *
 * `plan` is deliberately not served. It is on `public_tenant` because the
 * site's own code reads it, but what an organization pays for is its business
 * and nobody else's, and a published contract is a commitment to keep serving
 * what it lists.
 */
const route = publicRead(async ({ supabase }) => {
  const [tenant, branding, visibility, layout, modules] = await Promise.all([
    supabase
      .from("public_tenant")
      .select("slug, name, custom_domain")
      .maybeSingle(),
    supabase.from("public_branding").select("token, value"),
    getPageVisibility(supabase),
    supabase.from("public_site_layout").select("slot, value"),
    getPublicTenantModules(supabase),
  ]);

  const tenantRow = unwrap(tenant);

  return {
    tenant: {
      slug: tenantRow?.slug ?? null,
      name: tenantRow?.name ?? null,
      custom_domain: tenantRow?.custom_domain ?? null,
    },
    // Folded over the registry defaults, so a consumer gets the same colours
    // and the same sections the organization's own site renders rather than
    // only the rows it happens to have overridden.
    branding: brandingFromRows(
      (unwrap(branding) ?? []).map((row) => ({
        token: row.token ?? "",
        value: row.value,
      })),
    ),
    pages: visibility,
    layout: resolveLayoutValues(
      (unwrap(layout) ?? []).map((row) => ({
        slot: row.slot ?? "",
        value: row.value,
      })),
    ),
    modules,
  };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
