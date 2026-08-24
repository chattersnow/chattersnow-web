import { redirect } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  return (
    <main className="app-shell flex items-center justify-center px-6 py-12 sm:px-10">
      <Card className="w-full max-w-md [--card-spacing:--spacing(8)] sm:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <div className="relative mx-auto h-40 w-40">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow logo"
              width={320}
              height={320}
              priority
              className="h-full w-full object-contain"
            />
          </div>
        </CardHeader>

        <CardContent className="mt-2 flex flex-col gap-7">
          <SetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
