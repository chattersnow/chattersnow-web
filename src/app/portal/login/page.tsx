"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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

    router.replace("/home");
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/home`,
      },
    });

    if (signInError) {
      setError("Google sign-in is not available right now.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <main className="app-shell flex items-center justify-center px-6 py-12 sm:px-10">
      <section className="app-panel w-full max-w-md p-8 sm:p-10">
        <p className="app-eyebrow">
          Chatter Snow
        </p>
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em]">
          Portal login
        </h1>
        <p className="app-muted mt-3 text-sm leading-6">
          Sign in with an administrator account to continue.
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting || isSubmitting}
          className="app-button app-button-secondary mt-8 gap-3"
        >
          <span className="text-base font-bold" aria-hidden="true">
            G
          </span>
          {isGoogleSubmitting ? "Connecting to Google..." : "Continue with Google"}
        </button>

        <div className="app-muted mt-7 flex items-center gap-3 text-xs uppercase tracking-[0.16em]">
          <span className="h-px flex-1 bg-[var(--line)]" />
          <span>or</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="app-input mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="app-input mt-2"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-[#e84855]/10 px-4 py-3 text-sm text-[#b33f28]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="app-button app-button-primary"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}