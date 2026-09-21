"use client";

import { FormEvent, useState, useTransition } from "react";
import { registerForEventAction } from "./event-registration-actions";
import { RiderProfileForm } from "./rider-profile-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AttendedBeforeField } from "@/components/attended-before-field";
import { PrivacyNotice } from "@/components/privacy-notice";
import { PronounsField } from "@/components/pronouns-field";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  RegistrationAccountOffer,
  type AccountOffer,
} from "@/components/registration-account-offer";
import type { EventViewerAccount } from "./my-registration";

/**
 * The anonymous registration form, optionally prefilled from the caller's own
 * account (#1257).
 *
 * `account` is a *prefill*, not an attribution: both fields stay editable and
 * the submission still goes through `registerForEventAction`, which matches or
 * mints a `people` row exactly as it does for a visitor with no session. The
 * point is narrower than that -- an account between signing up and having its
 * claim (#1162) approved was being asked to type an address the application
 * had already verified, and a typo there mints the duplicate #1165 removed.
 *
 * Everything it puts on screen is derivable from the caller's own session, and
 * that is the line: nothing here may differ according to whether the address
 * matches a directory record, because a form that behaved differently would
 * answer "do you have a record of this person?" for anybody who can make an
 * account.
 */
export function EventRegistrationForm({
  eventId,
  account = null,
  accountOffer = null,
}: {
  eventId: string;
  account?: EventViewerAccount | null;
  /**
   * Whether to offer an account once this is saved, and which offer (#1258).
   * Null on a tenant without the constituent area, which is the default so
   * that nothing offers what it cannot deliver by accident.
   */
  accountOffer?: AccountOffer | null;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phone, setPhone] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [pronouns, setPronouns] = useState("");
  // #1259. Starts empty and stays empty unless the registrant picks something:
  // the unanswered state is a real third value and must not default to "no".
  const [attendedBefore, setAttendedBefore] = useState("");
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
    formData.set("attendedBefore", attendedBefore);
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
            {/* Named so the absence of a message in a minute's time reads as a
                problem rather than as normal. Its own element, not appended to
                the sentence above, which e2e/events.spec.ts locates by text. */}
            <span className="mt-1 block">
              We&apos;ve emailed a copy to {email}.
            </span>
          </AlertDescription>
        </Alert>
        {/* Two follow-ups want this slot, and the order is decided rather
            than incidental (#1258): the account offer is the one with a
            deadline, since the reader is about to close the sheet and the
            registration it carries is only claimable for a week. The rider
            profile keeps as long as the person does. Both are skippable in
            one click, neither is a gate, and if this ever stops reading
            calmly as two the rider profile moves into the confirmation
            email rather than becoming a third step. */}
        {accountOffer && (
          <div className="mt-6">
            <RegistrationAccountOffer
              offer={accountOffer}
              registrationId={registrationId}
            />
          </div>
        )}
        <RiderProfileForm registrationId={registrationId} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        {account?.email && (
          // One line, and no more than that. It says which session is filling
          // the fields in, so a shared browser can correct them; it says
          // nothing about what the organization knows.
          <p className="app-muted text-sm">Signed in as {account.email}.</p>
        )}
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="registration-name" required>
            Name
          </FieldLabel>
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
            <FieldLabel htmlFor="registration-email" required>
              Email
            </FieldLabel>
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
            Instagram handle
          </FieldLabel>
          <Input
            id="registration-instagram"
            placeholder="e.g. yourhandle"
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
        {/* Asked of everyone, unconditionally (#1259). It is not gated on the
            email matching a directory record and it is not moved into the
            post-registration step: a question only some people see answers
            "do you have a record of me?", and a step after the write is one
            that can be abandoned. Placed with the questions about the person
            rather than with the ones about this attendance. */}
        <AttendedBeforeField
          id="registration-attended-before"
          value={attendedBefore}
          onChange={setAttendedBefore}
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

        <PrivacyNotice surface="eventRegistration" />

        {/* Not "Register": that is the disclosure's trigger above the form
            (#1256), and two buttons of the same name in one section are one
            for the reader to disambiguate and one for a test to pick the
            wrong one of. */}
        <Button
          type="submit"
          variant="rainbow"
          disabled={isPending}
          className="w-full sm:w-fit"
        >
          {isPending ? "Registering..." : "Complete registration"}
        </Button>
      </FieldGroup>
    </form>
  );
}
