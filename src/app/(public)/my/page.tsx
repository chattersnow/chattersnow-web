import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { ClaimForm } from "./claim-form";
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
      </section>

      <Card className="rainbow-surface">
        <CardContent className="space-y-4">
          {personId ? (
            <>
              <h2 className="brand-display text-xl font-semibold">
                We have your record
              </h2>
              <p className="app-muted text-sm leading-relaxed">
                Your events, volunteering, giving and gear will appear here.
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

      <SignOutButton />
    </div>
  );
}
