import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand-style";
import { getTenantBranding } from "@/lib/tenant-branding";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { APPLE_TOUCH_ICON_SIZE, APP_ICON_PATH } from "@/lib/pwa/manifest";
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
    // iOS reads `apple-touch-icon` rather than the manifest's icons when it
    // adds a page to the home screen, so the manifest alone would install the
    // portal as a screenshot of the page (#1083). The route composes whatever
    // the tenant has into the same padded square the manifest points at, so
    // both platforms install the same mark.
    icons: { apple: `${APP_ICON_PATH}/${APPLE_TOUCH_ICON_SIZE}` },
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
