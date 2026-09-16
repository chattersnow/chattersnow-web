import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Sign in") };
}

export default async function MySignInPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in -- including an administrator arriving from the portal
  // on the same session, which is the whole point of #1160. Showing them a
  // sign-in form would suggest the account they are holding does not count
  // here.
  if (user) redirect(MY_PATH_PREFIX);

  const { name } = await getPublicSite(supabase);

  return (
    <div className="mx-auto w-full max-w-md space-y-8">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Sign in
          </h1>
        </div>
        <p className="app-muted mt-4 text-sm leading-relaxed">
          {name
            ? `See your history with ${name} and keep your details up to date.`
            : "See your history with us and keep your details up to date."}
        </p>
      </section>

      <Card className="rainbow-surface">
        <CardContent>
          {/* useSearchParams inside, so the boundary is required. */}
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
