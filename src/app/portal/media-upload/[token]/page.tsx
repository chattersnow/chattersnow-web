import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getPublicBranding, getPublicTenant } from "@/lib/branding";
import { UPLOAD_LINK_INVALID } from "@/lib/event-media-upload-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import { LinkUploadForm } from "./link-upload-form";
import { lookUpUploadLink } from "./upload-link";

export const metadata: Metadata = {
  title: "Upload photos & videos",
  // The URL carries the link's token: keep it out of an index and out of the
  // Referer of anything this page loads. next.config.ts sends both as headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where an event media upload link lands (#1620): a photographer or
 * videographer with no portal account uploads to one event.
 *
 * Outside the portal's `(app)` group, like the login page, so nobody signs in
 * -- the token is the permission. It shows the organization, the event's name
 * and date and who the link is for, and nothing else: no registrants, and none
 * of what is already stored. Under `/portal` so it resolves on every host,
 * including a portal-only one such as the platform tenant's.
 */
export default async function MediaUploadLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const [lookup, branding, tenant] = await Promise.all([
    lookUpUploadLink(token),
    getPublicBranding(supabase),
    getPublicTenant(supabase),
  ]);
  const orgName = tenant.status === "resolved" ? tenant.tenant.name : null;

  return (
    <main className="app-shell flex justify-center px-4 py-12 sm:px-10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <BrandLogo
            logoUrl={branding.logoUrl}
            alt={orgName ?? ""}
            className="mx-auto h-20 w-20"
            priority
          />
          {"link" in lookup ? (
            <>
              <h1 className="brand-display mt-2 text-2xl font-semibold tracking-brand">
                {lookup.link.eventName}
              </h1>
              <p className="app-muted text-sm">
                {formatDateTimeInZone(
                  lookup.link.startsAt,
                  lookup.link.timeZone,
                  DATE_TIME_WITH_ZONE,
                )}
              </p>
            </>
          ) : (
            <h1 className="brand-display mt-2 text-2xl font-semibold tracking-brand">
              This link no longer works
            </h1>
          )}
        </CardHeader>
        <CardContent>
          {"link" in lookup ? (
            <LinkUploadForm
              token={token}
              orgName={orgName}
              label={lookup.link.label}
              expiresAt={formatDateTimeInZone(
                lookup.link.expiresAt,
                lookup.link.timeZone,
                DATE_TIME_WITH_ZONE,
              )}
              rightsParagraphs={lookup.link.rightsParagraphs}
            />
          ) : (
            <Alert>
              <AlertDescription>
                {lookup.error === "rate_limited"
                  ? "Too many attempts. Please try again in a few minutes."
                  : UPLOAD_LINK_INVALID}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
