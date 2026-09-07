"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { submitVolunteerApplicationAction } from "./volunteer-application-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";

export function VolunteerApplicationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [roleInterest, setRoleInterest] = useState("");
  const [availability, setAvailability] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("pronouns", pronouns);
    formData.set("roleInterest", roleInterest);
    formData.set("availability", availability);
    formData.set("company", company);

    startTransition(async () => {
      const result = await submitVolunteerApplicationAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setReferenceCode(result.referenceCode);
    });
  }

  if (referenceCode) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          <p>Thanks for applying! We&apos;ll be in touch about next steps.</p>
          <p className="mt-2">
            Save your reference code to check your status later:{" "}
            <strong>{referenceCode}</strong>
          </p>
          <p className="mt-2">
            <Link
              href="/get-involved/volunteer/status"
              className="underline underline-offset-4"
            >
              Check your status
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="volunteer-name">Name</FieldLabel>
          <Input
            id="volunteer-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="volunteer-email">Email</FieldLabel>
            <Input
              id="volunteer-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="volunteer-phone">Phone</FieldLabel>
            <Input
              id="volunteer-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </Field>
        <PronounsField
          id="volunteer-pronouns"
          value={pronouns}
          onChange={setPronouns}
        />
        <Field>
          <FieldLabel htmlFor="volunteer-role-interest">
            What are you interested in helping with?
          </FieldLabel>
          <Input
            id="volunteer-role-interest"
            placeholder="On-Snow Mentor, Photographer/Videographer, Donations & Collection, or something else"
            value={roleInterest}
            onChange={(event) => setRoleInterest(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="volunteer-availability">
            Availability / notes
          </FieldLabel>
          <Textarea
            id="volunteer-availability"
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          />
        </Field>

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="volunteer-company">Company</label>
          <input
            id="volunteer-company"
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
          {isPending ? "Submitting..." : "Apply to volunteer"}
        </Button>
      </FieldGroup>
    </form>
  );
}
