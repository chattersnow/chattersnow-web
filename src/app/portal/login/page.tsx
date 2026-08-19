"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "oauth_failed"
      ? "Google sign-in failed. Please try again."
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Those login details could not be verified.");
      setIsSubmitting(false);
      return;
    }

    router.replace("/portal/home");
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/portal/home`,
      },
    });

    if (signInError) {
      setError("Google sign-in is not available right now.");
      setIsGoogleSubmitting(false);
    }
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
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
            className="w-full"
          >
            <span className="text-base font-bold" aria-hidden="true">
              G
            </span>
            {isGoogleSubmitting ? "Connecting to Google..." : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.16em]">
              or
            </span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}