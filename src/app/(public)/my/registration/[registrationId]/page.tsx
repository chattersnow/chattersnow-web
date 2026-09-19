import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { RegistrationAccountOffer } from "@/components/registration-account-offer";
import { requireConstituentSession } from "@/lib/constituent/guard";
import {
  MY_PATH_PREFIX,
  myRegistrationClaimPath,
} from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your registration"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/**
 * Where the sign-up hand-off lands (#1258).
 *
 * The offer after a registration is a link to `/my/sign-in` carrying this
 * path, so the registration survives whatever making an account costs -- a
 * password, a Google round trip, or an email confirmation opened tomorrow on a
 * different device. The guard sends a visitor with no session to sign in and
 * brings them back here, which is the whole reason this is a route and not a
 * query parameter: `safeMyDestination` only carries a `next` that is a path
 * inside `/my`.
 *
 * It reads nothing about the registration, and deliberately: an id that names
 * nothing, an id from another tenant and an id belonging to somebody else all
 * render this same page, and `submit_claim_from_registration()` is silent
 * about which of them it was. A page that said "we could not find that
 * registration" would be a way to test ids.
 *
 * The one thing it does say is about the reader's own account, which is theirs
 * to know: somebody already linked to a record is told it is already on it,
 * and sent to `/my`.
 */
export default async function MyRegistrationPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { registrationId } = await params;
  const { personId } = await requireConstituentSession(
    myRegistrationClaimPath(registrationId),
  );

  return (
    <PageShell>
      <div className="space-y-8">
        <section>
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-3xl font-semibold tracking-brand sm:text-4xl">
              Your registration
            </h1>
          </div>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed">
            You&apos;re registered either way — this only decides whether it
            ends up on your account.
          </p>
        </section>

        <Card className="rainbow-surface">
          <CardContent>
            {personId ? (
              <Alert>
                <AlertTitle>This is on your record</AlertTitle>
                <AlertDescription>
                  <p>
                    Your account is already linked, so there is nothing to ask
                    for. <Link href={MY_PATH_PREFIX}>See your account</Link>.
                  </p>
                </AlertDescription>
              </Alert>
            ) : (
              <RegistrationAccountOffer
                offer="claim"
                registrationId={registrationId}
                skipHref={MY_PATH_PREFIX}
                headingLevel="h2"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
