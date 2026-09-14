import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getPublicBranding, getPublicTenant } from "@/lib/branding";
import { isPortalHost } from "@/lib/portal/paths";
import { portalManifest } from "@/lib/pwa/manifest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The web app manifest, resolved from the request host (#1083).
 *
 * A metadata route rather than a static `public/manifest.json`, because there
 * is no one manifest to write down: the name, colours and icon belong to
 * whichever tenant owns the host being asked. Read through the host-resolved
 * `public_*` views rather than the session-resolved ones -- a manifest is
 * fetched by the browser without credentials, and often before anyone has
 * signed in.
 *
 * Reading `headers()` makes this dynamic, which is what we want: Next caches a
 * manifest route by default, and a cached one would serve the first tenant's
 * identity to every other tenant.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [requestHeaders, supabase] = await Promise.all([
    headers(),
    createSupabaseServerClient(),
  ]);
  const [tenantResult, branding] = await Promise.all([
    getPublicTenant(supabase),
    getPublicBranding(supabase),
  ]);

  return portalManifest({
    status: tenantResult.status,
    name: tenantResult.status === "resolved" ? tenantResult.tenant.name : null,
    branding,
    portalAtRoot: isPortalHost(requestHeaders.get("host") ?? ""),
  });
}
