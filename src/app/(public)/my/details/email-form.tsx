"use client";

import { FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestMyEmailChangeAction } from "./actions";

/**
 * The one field on this page that does not save when you press save (#1164).
 *
 * `people.email` is the address the organization writes to, the key #1162's
 * claim weighed and what every duplicate check matches on, so it moves only
 * once a link sent to the new address comes back. What this form does is ask;
 * the record keeps its current address until then, which is what makes a typo
 * here harmless rather than a quiet redirection of everything that gets sent.
 *
 * Kept visually apart from the rest of the form for that reason: a field
 * inside a group with one Save button reads as saving when Save is pressed,
 * and this one does not.
 */
export function EmailChangeForm({
  email,
  pendingEmail,
  pendingExpiresAt,
}: {
  email: string | null;
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
}) {
  const [value, setValue] = useState(email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [unchanged, setUnchanged] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSentTo(null);
    setUnchanged(false);
    setIsSending(true);

    const result = await requestMyEmailChangeAction(value);
    setIsSending(false);

    if ("error" in result) {
      setError(result.error.message);
      return;
    }
    if (result.outcome === "pending") {
      setSentTo(result.pendingEmail);
      return;
    }
    setUnchanged(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="my-email">Email</FieldLabel>
          <Input
            id="my-email"
            type="email"
            autoComplete="email"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription>
            Where we write to you. Changing it sends a link to the new address —
            we keep the old one until you follow it. This is not how you sign
            in, which is set with whoever provides your login.
          </FieldDescription>
        </Field>

        {/* A request from an earlier visit, still waiting. Rendered from the
            record rather than from this component's state so it survives a
            reload -- which is exactly when somebody comes back to check. */}
        {pendingEmail && !sentTo && (
          <Alert>
            <AlertDescription>
              We are waiting for you to confirm{" "}
              <span className="font-medium">{pendingEmail}</span>
              {pendingExpiresAt
                ? `. The link we sent works until ${formatDay(pendingExpiresAt)}.`
                : "."}{" "}
              Sending it again below replaces that link with a new one.
            </AlertDescription>
          </Alert>
        )}

        {sentTo && (
          <Alert>
            <AlertDescription>
              Check <span className="font-medium">{sentTo}</span> and follow the
              link. Nothing changes here until you do.
            </AlertDescription>
          </Alert>
        )}

        {unchanged && (
          <Alert>
            <AlertDescription>
              That is already the address on your record.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div>
          <Button type="submit" variant="outline" disabled={isSending}>
            {isSending ? (
              <>
                <Spinner /> Sending...
              </>
            ) : (
              "Send a confirmation link"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

/**
 * The day the link stops working, in the reader's own zone -- this renders in
 * the browser, so unlike the email's copy it can know that.
 */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
