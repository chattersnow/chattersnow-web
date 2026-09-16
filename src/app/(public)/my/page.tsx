import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import {
  getMyHistory,
  isHistoryEmpty,
  EMPTY_HISTORY,
} from "@/lib/constituent/history";
import { DEFAULT_VOCABULARY, getPublicVocabulary } from "@/lib/person-roles";
import { ClaimForm } from "./claim-form";
import { MyHistorySections } from "./history";
import { SignOutButton } from "./sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Your account") };
}

export default async function MyPage() {
  const { personId } = await requireConstituentSession();
  const supabase = await createSupabaseServerClient();
  const [{ name }, { data: pendingClaim }, { data: auth }] = await Promise.all([
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
  ]);

  // A second wave, and only for an account that has a record to read. An
  // unlinked one would spend four round trips learning what the guard already
  // told us, and the page it gets is the claim form either way.
  const [history, vocabulary] = personId
    ? await Promise.all([getMyHistory(supabase), getPublicVocabulary(supabase)])
    : [EMPTY_HISTORY, DEFAULT_VOCABULARY];

  return (
    <div className="space-y-8">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Your account
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {name
            ? `Your record with ${name}, and what you have done together.`
            : "Your record, and what you have done together."}
        </p>
        {/* The only navigation this area has, and it earns a place here rather
            than in a nav bar of one: keeping your record current (#1164) is a
            different job from reading it, and a real destination that appears
            in no navigation surface is the one thing
            docs/portal-navigation.md forbids outright. Only for an account
            with a record -- there is nothing to edit until a claim is
            approved, and the page below is the claim form. */}
        {personId && (
          <p className="mt-4">
            <Link
              href={`${MY_PATH_PREFIX}/details`}
              className={buttonVariants({ variant: "outline" })}
            >
              Edit your details
            </Link>
          </p>
        )}
      </section>

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
                  Nothing on it yet. Your events, volunteering, giving and gear
                  will appear here as they happen.
                </p>
              </>
            ) : pendingClaim ? (
              <Alert>
                <AlertTitle>We are checking your request</AlertTitle>
                <AlertDescription>
                  Someone is matching what you told us against our records. You
                  will hear from us either way.
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
    </div>
  );
}
