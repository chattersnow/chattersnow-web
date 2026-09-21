import { headers } from "next/headers";
import { getPublicBranding, getPublicTenant } from "@/lib/branding";
import { surfaceAtRoot } from "@/lib/pwa/host";
import { appManifest, MANIFEST_CONTENT_TYPE } from "@/lib/pwa/manifest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The staff app's manifest, resolved from the request host (#1083, #1171).
 *
 * Served per request rather than from a static `public/manifest.json`, because
 * there is no one manifest to write down: the name, colours and icon belong to
 * whichever tenant owns the host being asked. Read through the host-resolved
 * `public_*` views rather than the session-resolved ones -- a manifest is
 * fetched by the browser without credentials, and often before anyone has
 * signed in.
 *
 * An explicit route handler rather than the `app/manifest.ts` metadata
 * convention it replaced, and the URL is unchanged so installs made before
 * this keep resolving. The convention file is a *root* metadata route: Next
 * injects `<link rel="manifest">` into every page on every host from it, which
 * is exactly what has to stop. A visitor to the public site who tapped "Add to
 * Home Screen" got the staff portal -- for a staffer the wrong app, for
 * everyone else the no-access screen. The link is now emitted by each
 * surface's own layout, and this route only answers for the portal.
 *
 * Reading `headers()` makes this dynamic, which is what we want: Next caches a
 * route by default, and a cached manifest would serve the first tenant's
 * identity to every other tenant.
 */
export async function GET(): Promise<Response> {
  const [requestHeaders, supabase] = await Promise.all([
    headers(),
    createSupabaseServerClient(),
  ]);
  const [tenantResult, branding] = await Promise.all([
    getPublicTenant(supabase),
    getPublicBranding(supabase),
  ]);
  const host = requestHeaders.get("host") ?? "";

  return Response.json(
    appManifest({
      surface: "portal",
      status: tenantResult.status,
      name:
        tenantResult.status === "resolved" ? tenantResult.tenant.name : null,
      branding,
      atRoot: surfaceAtRoot("portal", host),
    }),
    { headers: { "Content-Type": MANIFEST_CONTENT_TYPE } },
  );
}
