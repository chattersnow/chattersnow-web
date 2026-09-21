import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicBranding, getPublicTenant } from "@/lib/branding";
import { constituentAreaEnabled } from "@/lib/constituent/guard";
import { servesPublicApp, surfaceAtRoot } from "@/lib/pwa/host";
import { appManifest, MANIFEST_CONTENT_TYPE } from "@/lib/pwa/manifest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The supporter app's manifest, resolved from the request host (#1171).
 *
 * The public site is its own installable app, separate from the portal's, for
 * the reason the origin already settled: a real tenant serves the two surfaces
 * from `www.<domain>` and `portal.<domain>`, which is two installs whatever a
 * manifest says. Everything about how it is read -- host-resolved, never
 * cached, neutral on a host no tenant claims -- matches the portal's route
 * next door, and the difference between the two apps lives entirely in
 * `appManifest`.
 *
 * It answers on two conditions, and 404s otherwise:
 *
 *   - Not on a `portal.` host, which serves no public page at all: the proxy
 *     rewrites the whole marketing tree into `/portal/*` there, so a manifest
 *     would describe an app with nothing in it and claim the portal's `id`.
 *   - On a host that serves both surfaces from one origin, only when the
 *     tenant has `constituent_accounts` on. The public app narrows its
 *     `start_url` to `/my` there so the two `scope`s cannot overlap, and `/my`
 *     is exactly what that module gates -- so without it this would advertise
 *     an install that opens on a 404. Read through the same host-resolved,
 *     sessionless path `/my` itself uses.
 *
 * This sits inside `(public)` rather than at the app root so it is obviously
 * the public surface's, but a route group adds no URL segment: the file is
 * served at `/site.webmanifest`, and route handlers do not render the layout
 * above them, so the checks it needs are its own.
 */
export async function GET(): Promise<Response> {
  const [requestHeaders, supabase] = await Promise.all([
    headers(),
    createSupabaseServerClient(),
  ]);
  const host = requestHeaders.get("host") ?? "";
  if (!servesPublicApp(host)) notFound();

  const atRoot = surfaceAtRoot("public", host);
  if (!atRoot && !(await constituentAreaEnabled())) notFound();

  const [tenantResult, branding] = await Promise.all([
    getPublicTenant(supabase),
    getPublicBranding(supabase),
  ]);

  return Response.json(
    appManifest({
      surface: "public",
      status: tenantResult.status,
      name:
        tenantResult.status === "resolved" ? tenantResult.tenant.name : null,
      branding,
      atRoot,
    }),
    { headers: { "Content-Type": MANIFEST_CONTENT_TYPE } },
  );
}
