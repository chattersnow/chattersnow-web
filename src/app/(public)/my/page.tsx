import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ViewerTime } from "@/components/viewer-time";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { isHrefVisible } from "@/lib/public-nav";
import {
  getMyHistory,
  isHistoryEmpty,
  EMPTY_HISTORY,
} from "@/lib/constituent/history";
import { DEFAULT_VOCABULARY, getPublicVocabulary } from "@/lib/person-roles";
import { ClaimForm } from "./claim-form";
import { MyHistorySections } from "./history";
import { MyPageLayout } from "./my-page-layout";
import { MyNextSteps } from "./next-steps";
import { SignOutButton } from "./sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your account"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

export default async function MyPage() {
  const { personId } = await requireConstituentSession();
  const supabase = await createSupabaseServerClient();
  const [
    { name, lexicon },
    { data: pendingClaim },
    { data: auth },
    visibility,
  ] = await Promise.all([
    getPublicSite(supabase),
    // Read through the claimant's own select policy, which is pinned to
    // auth.uid() -- so this is their claim or nothing, never a count of
    // anyone else's.
    supabase
      .from("person_claims")
      .select("id, status, created_at")
      .eq("status", "pending")
      .maybeSingle(),
    supabase.auth.getUser(),
    // No query of its own: `getPageVisibility` is request-cached and the
    // public layout wrapping this page has already issued it against the same
    // client instance, so this resolves off that read (#1183).
    getPageVisibility(supabase),
  ]);
  const hidden = hiddenSlots(visibility);

  // A second wave, and only for an account that has a record to read. An
  // unlinked one would spend four round trips learning what the guard already
  // told us, and the page it gets is the claim form either way.
  const [history, vocabulary] = personId
    ? await Promise.all([getMyHistory(supabase), getPublicVocabulary(supabase)])
    : [EMPTY_HISTORY, DEFAULT_VOCABULARY];

  return (
    <MyPageLayout
      current="home"
      title="Your account"
      intro={
        name
          ? `Your record with ${name}, and what you have done together.`
          : "Your record, and what you have done together."
      }
      // Only for an account with a record: there is nothing to edit, log or
      // choose until a claim is approved, and the page below is the claim form
      // rather than the hub.
      showNav={Boolean(personId)}
    >
      {personId && !isHistoryEmpty(history) ? (
        <div className="space-y-6">
          <MyHistorySections history={history} vocabulary={vocabulary} />
        </div>
      ) : (
        <Card className="rainbow-surface">
          <CardContent className="space-y-4">
            {personId ? (
              // Linked, with nothing behind it yet -- the common case on a
              // freshly approved claim. One sentence that reads as complete,
              // rather than four empty cards that read as broken.
              <>
                <h2 className="brand-display text-xl font-semibold">
                  We have your record
                </h2>
                <p className="app-muted text-sm leading-relaxed">
                  Nothing on it yet. Your events, volunteering, giving and
                  requests will appear here as they happen.
                </p>
                {/* Somebody who has just been approved has done everything
                      asked of them, and the sentence above is otherwise where
                      the page stops. */}
                <MyNextSteps hidden={hidden} lexicon={lexicon} />
              </>
            ) : pendingClaim ? (
              <Alert>
                <AlertTitle>We are checking your request</AlertTitle>
                <AlertDescription>
                  <p>
                    Sent{" "}
                    <ViewerTime
                      iso={pendingClaim.created_at}
                      fallbackZone="UTC"
                      options={{ dateStyle: "long" }}
                    />
                    . Someone is matching what you told us against our records.
                    You will hear from us either way.
                  </p>
                  {/* The date is only useful next to somewhere to take it.
                        A claim that has sat for a fortnight is usually one
                        where a detail was mistyped, and this page is the only
                        place its sender can see that it has. */}
                  {isHrefVisible(hidden, "/contact") && (
                    <p>
                      If something you sent was wrong, or this has been waiting
                      longer than you expected,{" "}
                      <Link href="/contact">get in touch</Link>.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              // Signed in and linked to nothing. Most people who see this have
              // just made an account, so it opens with the thing to do rather
              // than with an explanation of what went wrong -- nothing has.
              <ClaimForm defaultEmail={auth.user?.email ?? null} />
            )}
          </CardContent>
        </Card>
      )}

      <SignOutButton />
    </MyPageLayout>
  );
}
