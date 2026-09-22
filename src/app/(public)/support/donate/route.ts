import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPageVisible } from "@/lib/page-visibility";
import { getPublicGivingSettings } from "@/lib/public-giving";
import {
  givingIsPublished,
  givingUrlWithAmount,
  parseSuggestedAmounts,
} from "@/lib/giving";

/**
 * `/support/donate` (#1389): one stable address for this organization's giving
 * page, wherever that page currently lives.
 *
 * The point is the things that cannot be re-issued -- a printed card, a QR
 * code on a poster, an Instagram bio, a sponsor's own site. A tenant that
 * moves from a fiscal sponsor's page to its own processor changes one setting
 * in Finance > Donations and every one of those keeps working; a link straight
 * to the provider would have to be reprinted.
 *
 * 404 when giving is off, exactly as a tenant without terms 404s `/terms`.
 * The Support section's page-visibility gate is checked here too: a route
 * handler renders no layout, so `(public)/support/layout.tsx` -- which is what
 * hides the rest of the section -- never runs for this URL.
 *
 * NOT RATE LIMITED, on purpose. The per-`(route, ip_address)` limiter exists
 * for public writes: a GET with no body that reads two cached settings and
 * answers with a redirect creates nothing and costs a visitor nothing to
 * repeat. Adding it here would only cap how often somebody may follow a link
 * to a page the organization is asking them to visit.
 */
export async function GET(request: Request) {
  if (!(await isPageVisible("support"))) notFound();

  const supabase = await createSupabaseServerClient();
  const settings = await getPublicGivingSettings(supabase);
  if (!givingIsPublished(settings)) notFound();

  // `?amount=` only ever reaches the provider as one of the amounts this
  // tenant configured. Anything else is dropped rather than refused: somebody
  // following a stale printed link should still land on the giving page.
  const requested = Number(new URL(request.url).searchParams.get("amount"));
  const offered = parseSuggestedAmounts(settings.suggestedAmounts);
  const amount = offered.includes(requested) ? requested : 0;

  const destination = amount
    ? givingUrlWithAmount(settings.url, amount, settings.amountParam)
    : settings.url;

  // 302 rather than a permanent redirect: the destination is a setting the
  // organization can change this afternoon, and `no-store` keeps a browser or
  // a CDN from holding yesterday's processor.
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
