import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { AsIsAcknowledgementForm } from "@/components/as-is-acknowledgement-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import { getPublicLexicon } from "@/lib/lexicon";
import { getLegalPublication } from "@/lib/legal-publication";
import {
  ACKNOWLEDGEMENT_LINK_INVALID,
  toAcknowledgementView,
} from "@/lib/distribution-acknowledgement";
import { acknowledgeAsIsAction } from "./actions";

export const metadata: Metadata = {
  title: "Given as-is",
  // A URL carrying a token is kept out of an index and out of the Referer of
  // anything this page loads, as the answers link does (#1502).
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where a handout's one-time QR code lands (#1519), on the recipient's own
 * phone, and where a gear request's emailed link lands (#1518). Public by
 * design -- the recipient has no account -- and the token is the permission:
 * to acknowledge this one open handout, or this one request, as-is, and
 * nothing else. The page shows a first name, the event and the pieces, and no
 * contact details. One RPC pair answers for both kinds of token, so the page
 * never has to be told which it holds.
 */
export default async function AcknowledgeHandoutPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";

  const supabase = await createSupabaseServerClient();
  const [lookup, lexicon, publication] = await Promise.all([
    isConfirmationToken(token)
      ? supabase.rpc("get_as_is_acknowledgement", {
          p_token_hash: hashConfirmationToken(token),
          p_ip_address: await getClientIp(),
        })
      : Promise.resolve({ data: null, error: { message: "LINK_INVALID" } }),
    getPublicLexicon(supabase),
    getLegalPublication(supabase),
  ]);

  if (lookup.error || !lookup.data) {
    return (
      <PageShell>
        <Heading>This no longer works</Heading>
        <div className="mt-6 max-w-xl">
          <Alert>
            <AlertDescription>
              {lookup.error?.message.includes("Too many")
                ? "Too many attempts. Please try again in a few minutes."
                : ACKNOWLEDGEMENT_LINK_INVALID}
            </AlertDescription>
          </Alert>
        </div>
      </PageShell>
    );
  }

  const view = toAcknowledgementView(lookup.data);
  return (
    <PageShell>
      <Heading>
        {view.kind === "gear_request"
          ? "About the items you asked for"
          : "Before you take these"}
      </Heading>
      <div className="mt-6 max-w-xl">
        <AsIsAcknowledgementForm
          view={view}
          lexicon={lexicon}
          termsInForce={publication.terms}
          onAcknowledge={acknowledgeAsIsAction.bind(null, token)}
        />
      </div>
    </PageShell>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="w-fit">
      <div className="rainbow-accent w-full" />
      <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
        {children}
      </h1>
    </div>
  );
}
