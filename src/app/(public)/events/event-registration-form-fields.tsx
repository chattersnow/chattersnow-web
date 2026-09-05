"use client";

import { FormEvent, useState, useTransition } from "react";
import { registerForEventAction } from "./event-registration-actions";
import { RiderProfileForm } from "./rider-profile-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";

export function EventRegistrationForm({ eventId }: { eventId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Holds the new registration's id once saved -- both the "did it work?"
  // flag and the token the rider-profile follow-up needs to authorize itself.
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("instagramHandle", instagramHandle);
    formData.set("pronouns", pronouns);
    formData.set("partySize", partySize);
    formData.set("notes", notes);
    formData.set("company", company);

    startTransition(async () => {
      const result = await registerForEventAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRegistrationId(result.registrationId);
    });
  }

  if (registrationId) {
    return (
      <div>
        <Alert>
          <div className="rainbow-accent mb-2 w-10" />
          <AlertDescription>
            You&apos;re registered! We look forward to seeing you there.
          </AlertDescription>
        </Alert>
        <RiderProfileForm registrationId={registrationId} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="registration-name">Name</FieldLabel>
          <Input
            id="registration-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="registration-email">Email</FieldLabel>
            <Input
              id="registration-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="registration-phone">Phone</FieldLabel>
            <Input
              id="registration-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </Field>
        <Field>
          <FieldLabel htmlFor="registration-instagram">
            Instagram handle (optional)
          </FieldLabel>
          <Input
            id="registration-instagram"
            placeholder="e.g. chattersnow"
            autoComplete="off"
            value={instagramHandle}
            onChange={(event) => setInstagramHandle(event.target.value)}
          />
        </Field>
        <PronounsField
          id="registration-pronouns"
          value={pronouns}
          onChange={setPronouns}
        />
        <Field>
          <FieldLabel htmlFor="registration-party-size">
            Number attending
          </FieldLabel>
          <Input
            id="registration-party-size"
            type="number"
            min={1}
            step={1}
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="registration-notes">Notes</FieldLabel>
          <Textarea
            id="registration-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="registration-company">Company</label>
          <input
            id="registration-company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          variant="rainbow"
          disabled={isPending}
          className="w-full sm:w-fit"
        >
          {isPending ? "Registering..." : "Register"}
        </Button>
      </FieldGroup>
    </form>
  );
}
