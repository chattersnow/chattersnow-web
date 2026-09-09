import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicBranding } from "@/lib/branding";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Set Password",
};

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  // The logo the host's tenant has set, if any. It was
  // `/chatter-logo-transparent.png` hardcoded, so every tenant's set-password
  // page carried Chatter Snow's mark (#838). #817 fixed the login page and
  // missed this one -- which matters more, because this is where an invite
  // link lands: the first page a newly invited admin ever sees.
  const [
    {
      data: { user },
    },
    branding,
  ] = await Promise.all([supabase.auth.getUser(), getPublicBranding(supabase)]);

  if (!user) {
    redirect("/portal/login");
  }

  return (
    <main className="app-shell flex items-center justify-center px-6 py-12 sm:px-10">
      <Card className="w-full max-w-md [--card-spacing:--spacing(8)] sm:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <BrandLogo
            logoUrl={branding.logoUrl}
            alt=""
            className="mx-auto h-32 w-32"
            priority
          />
          {/* The page had no heading, so the only thing a screen reader met
              before the fields was the logo's alt text -- the same gap #817
              closed on the login page. The logo is decorative beside a real
              h1, hence alt="". */}
          <h1 className="brand-display mt-2 text-center text-3xl font-semibold tracking-[-0.04em]">
            Set your password
          </h1>
        </CardHeader>

        <CardContent className="mt-2 flex flex-col gap-7">
          <SetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
