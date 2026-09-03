"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

function urlErrorMessage(reason: string | null) {
  if (reason === "oauth_failed")
    return "Google sign-in failed. Please try again.";
  if (reason === "invite_failed")
    return "This invite link is invalid or has expired. Ask an administrator for a new one.";
  return null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A signed-in account with no roles is bounced here. Without a way out,
  // "Continue with Google" reuses the cached session and lands straight back
  // -- and the likeliest cause is being signed into a personal Google account
  // rather than an org one, which is exactly the case that needs to switch.
  const isNoAccess = searchParams.get("error") === "no_access";
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    urlErrorMessage(searchParams.get("error")),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (!isNoAccess) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, [isNoAccess]);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // Back to a clean login with the banner cleared, so the page stops
    // describing a session that has just ended.
    router.replace("/portal/login");
    router.refresh();
  }

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
        // Force the account chooser when the current session is the problem:
        // Google would otherwise silently re-authorise the same account and
        // return the user to this screen.
        ...(isNoAccess ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });

    if (signInError) {
      setError("Google sign-in is not available right now.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <>
      {isNoAccess && (
        <Alert variant="destructive">
          <AlertTitle>Portal access not granted yet</AlertTitle>
          <AlertDescription>
            <p>
              {signedInEmail
                ? `You're signed in as ${signedInEmail}, but that account hasn't been granted portal access.`
                : "You're signed in, but this account hasn't been granted portal access."}{" "}
              Ask an administrator to grant it, or sign out and use a different
              account.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full"
            >
              {isSigningOut ? (
                <>
                  <Spinner /> Signing out...
                </>
              ) : (
                "Sign out"
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={handleGoogleSignIn}
        disabled={isGoogleSubmitting || isSubmitting}
        className="w-full"
      >
        <span className="text-base font-bold" aria-hidden="true">
          G
        </span>
        {isGoogleSubmitting ? (
          <>
            <Spinner /> Connecting to Google...
          </>
        ) : (
          "Continue with Google"
        )}
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
            {isSubmitting ? (
              <>
                <Spinner /> Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </FieldGroup>
      </form>
    </>
  );
}
