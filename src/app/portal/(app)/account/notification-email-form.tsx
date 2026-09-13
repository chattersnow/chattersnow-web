"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import { updateMyNotificationEmailAction } from "./actions";

/**
 * Where this person's portal email is delivered (#1042). Sits above the
 * switches rather than beside the preferred name, because it answers the same
 * question they do -- what reaches me, and where -- and because leaving it with
 * the identity fields invites reading it as a second way to sign in.
 */
export function NotificationEmailForm({
  notificationEmail,
  signInEmail,
}: {
  notificationEmail: string | null;
  /** The address on the account, shown as the placeholder it falls back to. */
  signInEmail: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(notificationEmail ?? "");
  // Baseline for the dirty check, in state rather than read off the prop, so a
  // save settles the form without waiting for router.refresh() -- the same
  // reason AccountForm keeps one.
  const [baseline, setBaseline] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = value.trim() !== baseline.trim();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      await runAction(() => updateMyNotificationEmailAction(value), {
        success: value.trim()
          ? `Notifications will go to ${value.trim()}.`
          : `Notifications will go to ${signInEmail}.`,
        onError: setError,
        onSuccess: () => {
          setBaseline(value);
          router.refresh();
        },
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field>
        <FieldLabel htmlFor="notificationEmail">Send them to</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="notificationEmail"
            name="notificationEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="max-w-xs"
            value={value}
            placeholder={signInEmail}
            disabled={isPending}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={isPending || !isDirty}
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
        <FieldDescription>
          Leave it empty to use {signInEmail}, the address you sign in with.
          This only changes where email arrives — you still sign in the same
          way.
        </FieldDescription>
      </Field>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
