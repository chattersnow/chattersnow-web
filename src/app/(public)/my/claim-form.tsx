"use client";

import { FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { submitClaimAction } from "./claim-actions";

/**
 * Ask to be linked to an existing record (#1162).
 *
 * Three fields do the matching and one is prose for whoever reviews it. The
 * Instagram handle is asked for because it is often the *only* identifier on a
 * record created from an event registration, which carries its own handle --
 * without it the middle matching tier has nothing to work with.
 *
 * What this screen must never do is react to whether anything matched. The
 * confirmation below is one fixed sentence, shown to a lifelong donor and to
 * somebody who has never heard of the organization alike.
 */
export function ClaimForm({ defaultEmail }: { defaultEmail: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await submitClaimAction(new FormData(event.currentTarget));
    setIsSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Alert>
        <AlertTitle>Thanks — we have your request</AlertTitle>
        <AlertDescription>
          Someone will check it against our records and link your account. You
          will hear from us either way.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <p className="app-muted text-sm leading-relaxed">
          Tell us who you are and we will connect this account to your history
          with us. A person checks every request.
        </p>

        <Field>
          <FieldLabel htmlFor="claim-name">Your name *</FieldLabel>
          <Input
            id="claim-name"
            name="name"
            required
            autoComplete="name"
            // The name we would have them under, which is not always the name
            // they go by now.
            placeholder="The name we would have you under"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="claim-email">Email</FieldLabel>
          <Input
            id="claim-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail ?? ""}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="claim-instagram">Instagram</FieldLabel>
          <Input
            id="claim-instagram"
            name="instagram"
            autoComplete="off"
            placeholder="@yourhandle"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="claim-phone">Phone</FieldLabel>
          <Input id="claim-phone" name="phone" type="tel" autoComplete="tel" />
        </Field>

        <Field>
          <FieldLabel htmlFor="claim-note">Anything that would help</FieldLabel>
          <Textarea
            id="claim-note"
            name="note"
            rows={3}
            placeholder="An event you came to, something you donated, who you know."
          />
        </Field>

        <RequiredFieldsNote />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Send request
        </Button>
      </FieldGroup>
    </form>
  );
}
