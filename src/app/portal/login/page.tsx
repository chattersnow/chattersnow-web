import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log In",
};

export default function PortalLoginPage() {
  return (
    <main className="app-shell flex items-center justify-center px-6 py-12 sm:px-10">
      <Card className="w-full max-w-md [--card-spacing:--spacing(8)] sm:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <div className="relative mx-auto h-32 w-32">
            <Image
              src="/chatter-logo-transparent.png"
              alt=""
              width={320}
              height={320}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          {/* The page had no heading at all, so the only thing a screen
              reader met before the controls was the logo's alt text. The
              logo is decorative next to a real h1, hence alt="". */}
          <h1 className="brand-display mt-2 text-center text-3xl font-semibold tracking-[-0.04em]">
            Operations Portal
          </h1>
        </CardHeader>

        <CardContent className="mt-2 flex flex-col gap-7">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <Link
            href="/home"
            className="app-muted inline-flex items-center justify-center gap-1.5 text-sm hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to chattersnow.org
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
