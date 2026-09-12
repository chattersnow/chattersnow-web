import { NextResponse } from "next/server";
import { getLegalPublication } from "@/lib/legal-publication";
import { getPublicSite } from "@/lib/public-site";
import { getRequestOrigin } from "@/lib/request-origin";
import { buildSecurityTxt, securityContactUri } from "@/lib/security-txt";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * `/.well-known/security.txt`, for the tenant this host belongs to (#975).
 *
 * A route rather than the static file it replaced, because the file is about
 * one organization and this deployment answers on every tenant's domain. The
 * reasoning, and everything that decides what the file says, is in
 * `@/lib/security-txt`; this is the read.
 *
 * Two 404s, and they mean different things. An unresolved host belongs to no
 * tenant, so there is nobody to name -- the same answer the public layout
 * gives. A resolved tenant with no usable contact has nowhere to send a report,
 * and publishing a disclosure document with no working way to disclose is the
 * failure this replaces, not a milder version of it.
 *
 * `unavailable` -- the tenant read itself failed -- deliberately falls through
 * to the unset branch. `getPublicSite` leaves the name null and the content at
 * the registry defaults there, and the default contact is blank, so a database
 * blip takes the file off the air for the duration rather than publishing one
 * that names nobody.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  if (site.status === "unresolved") {
    return new NextResponse(null, { status: 404 });
  }

  const contact = securityContactUri(site.content.text("org.email_security"));
  if (!contact) {
    return new NextResponse(null, { status: 404 });
  }

  const [origin, inForce] = await Promise.all([
    getRequestOrigin(),
    getLegalPublication(supabase),
  ]);

  const body = buildSecurityTxt({
    organization: site.name,
    contact,
    note: site.content.paragraphs("org.security_note"),
    origin,
    // Only when this tenant has actually put its terms in force: /terms 404s
    // until then (#859), and a Policy field pointing at a 404 is worse than no
    // Policy field, which RFC 9116 makes optional for exactly this reason.
    policyUrl: inForce.terms ? `${origin}/terms` : null,
    now: new Date(),
  });

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // An hour. The body is stable for a day (`Expires` is anchored to
      // midnight), but the contact behind it is a settings row an organization
      // may need to correct in a hurry.
      "cache-control": "public, max-age=3600",
    },
  });
}
