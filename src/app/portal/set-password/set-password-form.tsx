"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Spinner } from "@/components/ui/spinner";

/**
 * Where to send the browser once the password is set.
 *
 * A parameter rather than the hardcoded `/portal/home` it used to be (#1161).
 * This page requires a session and no role, so it already served both kinds of
 * account -- but it always finished at the dashboard, which bounces anyone
 * without a role straight back out to the no-access screen. A constituent
 * resetting their password from `/my/sign-in` would have read that as the
 * reset having failed.
 *
 * Narrow on purpose: the value reaches here from a query string, so anything
 * that is not one of the two destinations this page actually serves falls back
 * to the portal dashboard.
 */
export type SetPasswordDestination = "/portal/home" | "/my";

export function safeSetPasswordDestination(
  next: string | null | undefined,
): SetPasswordDestination {
  return next === "/my" ? "/my" : "/portal/home";
}

export function SetPasswordForm({
  destination = "/portal/home",
}: {
  destination?: SetPasswordDestination;
} = {}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError("Could not set your password. Please try again.");
      setIsSubmitting(false);
      return;
    }

    router.replace(destination);
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <p className="app-muted text-sm">Choose a password for your account.</p>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="password" required>
            Password
          </FieldLabel>
          <Input
            id="password"
            required
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password" required>
            Confirm password
          </FieldLabel>
          <Input
            id="confirm-password"
            required
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <>
              <Spinner /> Saving...
            </>
          ) : (
            "Set password"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
