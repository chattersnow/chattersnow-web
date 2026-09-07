import type { Metadata } from "next";
import { BrandStyle } from "@/components/brand-style";
import { getTenantBranding } from "@/lib/tenant-branding";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
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
