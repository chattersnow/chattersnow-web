"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { registerMyselfForEventAction } from "./my-registration-actions";

/**
 * Registering as yourself (#1165).
 *
 * Shorter than the anonymous form by the two fields that cause the trouble:
 * name and email are read off the record rather than typed, so a registration
 * cannot land on a second copy of somebody because they typed a different
 * address this time. They are shown, because a person is entitled to see which
 * name they are about to appear under, and changing either is a link to
 * `/my/details` -- where a name is saved and an address is confirmed before it
 * moves.
 *
 * The rest is about this one attendance and travels on the registration alone:
 * a phone number corrected here reaches the organizer of this event and does
 * not silently rewrite the record. #1164's allowlist is the only thing that
 * edits a person, and a registration form is not it.
 */
export function MyEventRegistrationForm({
  eventId,
  person,
}: {
  eventId: string;
  person: MyContactDetails;
}) {
  const [phone, setPhone] = useState(person.phone ?? "");
  const [pronouns, setPronouns] = useState(person.pronouns ?? "");
  const [instagramHandle, setInstagramHandle] = useState(
    person.instagram_handle ?? "",
  );
  const [partySize, setPartySize] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const displayName =
    person.preferred_name?.trim() || person.name?.trim() || "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("partySize", partySize);
    formData.set("notes", notes);
    formData.set("phone", phone);
    formData.set("pronouns", pronouns);
    formData.set("instagramHandle", instagramHandle);

    startTransition(async () => {
      const result = await registerMyselfForEventAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRegistered(true);
    });
  }

  if (registered) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          You&apos;re registered! We look forward to seeing you there.
          <span className="mt-1 block">
            {person.email
              ? `We've emailed a copy to ${person.email}.`
              : "It is on your account."}{" "}
            <Link href={MY_PATH_PREFIX} className="underline">
              See it on your account
            </Link>
            .
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <p className="app-muted text-sm leading-relaxed">
          Registering as {displayName || "yourself"}
          {person.email ? ` (${person.email})` : ""}.{" "}
          <Link href={`${MY_PATH_PREFIX}/details`} className="underline">
            Not you, or out of date?
          </Link>
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel htmlFor="my-registration-party">
            How many of you?
          </FieldLabel>
          <Input
            id="my-registration-party"
            type="number"
            min="1"
            inputMode="numeric"
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="my-registration-phone">Phone</FieldLabel>
            <Input
              id="my-registration-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <FieldDescription>
              For this event only. We keep what is on your record.
            </FieldDescription>
          </Field>
          <PronounsField
            id="my-registration-pronouns"
            value={pronouns}
            onChange={setPronouns}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="my-registration-instagram">Instagram</FieldLabel>
          <Input
            id="my-registration-instagram"
            value={instagramHandle}
            onChange={(event) => setInstagramHandle(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="my-registration-notes">
            Anything we should know?
          </FieldLabel>
          <Textarea
            id="my-registration-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        <Field orientation="horizontal">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Registering…" : "Register"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
