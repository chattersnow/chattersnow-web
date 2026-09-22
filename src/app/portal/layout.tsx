import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand-style";
import { getTenantBranding } from "@/lib/tenant-branding";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { APP_ICONS_METADATA, PORTAL_MANIFEST_PATH } from "@/lib/pwa/manifest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalUrlCanonicalizer } from "./portal-url-canonicalizer";

// The portal is titled and styled for the tenant the signed-in user has
// selected (#707 Phase 4). Signed out -- the login page -- there is no
// tenant, so it is just "Portal" in the stylesheet's colours.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  // No auth.getUser() round trip: signed out, the tenant read simply comes
  // back empty, and the (app) layout already validates the session once per
  // request for every route that needs it.
  const tenant = currentTenant(await getTenantContext(supabase));
  const name = tenant ? `${tenant.name} Portal` : "Portal";
  return {
    title: { default: name, template: `%s | ${name}` },
    // Linked from the portal's own layout rather than from a root metadata
    // route (#1171). A root one injects the link into every page on every
    // host, so a visitor to the public site who tapped "Add to Home Screen"
    // installed the staff portal. Next accepts a URL path here and emits the
    // `<link rel="manifest">` for this subtree alone; the public site links
    // its own manifest the same way.
    manifest: PORTAL_MANIFEST_PATH,
    // The tab icon and the home-screen icon, both composed from what the
    // tenant has uploaded (#1083). Declared through the shared constant
    // because the `icon` half is load-bearing: `metadata.icons` here replaces
    // the `app/icon.png` file convention wholesale, so an object naming only
    // `apple` leaves the portal with no favicon at all (#1398).
    icons: APP_ICONS_METADATA,
  };
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const branding = await getTenantBranding(supabase);
  return (
    <>
      <BrandStyle branding={branding} />
      <PortalUrlCanonicalizer />
      {children}
    </>
  );
}
