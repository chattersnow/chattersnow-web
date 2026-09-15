import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { SignOutButton } from "./sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Your account") };
}

export default async function MyPage() {
  const { personId } = await requireConstituentSession();
  const supabase = await createSupabaseServerClient();
  const { name } = await getPublicSite(supabase);

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
          ) : (
            // Signed in, but no `people` row carries this account's id. The
            // claim and its review are #1162; until then this says so plainly
            // rather than implying the account is broken. It is also the
            // correct answer for a brand-new sign-up, which is most of them.
            <Alert>
              <AlertTitle>We have not linked you to a record yet</AlertTitle>
              <AlertDescription>
                Your account is set up, but it is not yet connected to your
                history with us. Ask us to link it and your events, volunteering
                and giving will show up here.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <SignOutButton />
    </div>
  );
}
