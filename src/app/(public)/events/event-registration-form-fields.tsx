"use client";

import { useState, useTransition } from "react";
import { registerForEventAction } from "./event-registration-actions";
import { RiderProfileForm } from "./rider-profile-form-fields";
import type { RegistrationStep } from "./registration-step";
import { RegistrationSteps } from "./registration-steps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AttendedBeforeField } from "@/components/attended-before-field";
import {
  EMPTY_MINOR_CONTACTS,
  MinorAccompanimentFields,
  type MinorContactValues,
} from "@/components/minor-accompaniment-fields";
import { PartyIncludesMinorField } from "@/components/party-includes-minor-field";
import { PhotoConsentNotice } from "@/components/photo-consent-notice";
import { RegistrationOptionCountsField } from "@/components/registration-option-counts-field";
import {
  optionCountsError,
  setOptionCounts,
  type OptionCounts,
  type RegistrationOptionsQuestion,
} from "@/lib/registration-options";
import { PrivacyNotice } from "@/components/privacy-notice";
import { PronounsField } from "@/components/pronouns-field";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  RecordAccountOffer,
  type AccountOffer,
} from "@/components/record-account-offer";
import type { EventViewerAccount } from "./my-registration";
import type { PublicRiderProfile } from "@/lib/rider-profile";

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
  waiver = null,
  waiverBlock = null,
  minorAccompaniment = [],
  photoConsent = [],
  registrationOptions = null,
  riderProfile = null,
}: {
  eventId: string;
  account?: EventViewerAccount | null;
  /**
   * Whether to offer an account once this is saved, and which offer (#1258).
   * Null on a tenant without the constituent area, which is the default so
   * that nothing offers what it cannot deliver by accident.
   */
  accountOffer?: AccountOffer | null;
  /**
   * The participant agreement's version, when this organization takes one
   * (#686). Posted back so the RPC can refuse a submission made against text
   * that has been republished since it was rendered. Null, and the block
   * below with it, on a tenant that has adopted no waiver -- which is most of
   * them, and leaves this form exactly as it was. The title is what the box
   * names (#1402): an agreement accepted by reference to "the agreement
   * above" reads less clearly than one accepted by name.
   */
  waiver?: { version: number; title: string } | null;
  /** The agreement itself, rendered on the server. */
  waiverBlock?: React.ReactNode;
  /**
   * This organization's rule for a party that includes anyone under 18
   * (#685), from `events.minor_accompaniment`. Empty on a tenant that has
   * written none, which leaves the revealed block saying only what this form
   * asks for and what it never asks for.
   */
  minorAccompaniment?: string[];
  /**
   * This organization's photos-and-video paragraphs (#599, #1376), from
   * `events.photo_consent`. Empty on a tenant that has written none — which is
   * almost all of them — and empty means the form says nothing at all: no
   * heading, no notice, byte-identical to the form before #599 shipped.
   *
   * Nothing on this form is collected against them any more. They are what
   * makes registering carry the agreement, which is a claim only the
   * organization can make, so the platform writes none of it; the objection
   * that answers them is recorded elsewhere, by an organizer, by email, or
   * from the registrant's own registration page.
   */
  photoConsent?: string[];
  /**
   * The event's registration question (#1407). Null for an event that asks
   * none, which leaves this form exactly as it was.
   */
  registrationOptions?: RegistrationOptionsQuestion | null;
  /**
   * The post-registration rider profile step (#564), and the mountains it
   * offers. Null -- the default -- on every tenant without the rider_profile
   * module (#1408), which leaves the confirmation with no follow-up question.
   */
  riderProfile?: PublicRiderProfile | null;
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
  // #685. No default, for the reason `attendedBefore` has none and a stronger
  // one: a preselected "no" is how a party with a child arrives unflagged, and
  // "no" is an answer somebody has to give rather than one the form gives on
  // their behalf. Unlike that question, this one is required.
  const [partyIncludesMinor, setPartyIncludesMinor] = useState("");
  const [minorContacts, setMinorContacts] =
    useState<MinorContactValues>(EMPTY_MINOR_CONTACTS);
  const [notes, setNotes] = useState("");
  // #1407. Every option starts at nothing: a preselected answer is one the
  // form gave on their behalf.
  const [optionCounts, setOptionCountsState] = useState<OptionCounts>({});
  const [company, setCompany] = useState("");
  // Starts unticked, always. A pre-ticked box is not an acceptance, and this
  // is the one control on the form where that matters (#686).
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState<{
    message: string;
    step: RegistrationStep;
  } | null>(null);
  // Holds the new registration's id once saved -- both the "did it work?"
  // flag and the token the rider-profile follow-up needs to authorize itself.
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    if (registrationOptions) {
      const message = optionCountsError(optionCounts, Number(partySize));
      if (message) {
        setError({ message, step: "details" });
        return;
      }
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("instagramHandle", instagramHandle);
    formData.set("pronouns", pronouns);
    formData.set("attendedBefore", attendedBefore);
    formData.set("partySize", partySize);
    formData.set("partyIncludesMinor", partyIncludesMinor);
    // Only when the answer is yes. A reader who answered yes, filled these in
    // and changed their mind must not leave a guardian's number behind them,
    // and the parser reads them under the same condition.
    if (partyIncludesMinor === "yes") {
      for (const [key, value] of Object.entries(minorContacts)) {
        formData.set(key, value);
      }
    }
    if (registrationOptions) setOptionCounts(formData, optionCounts);
    formData.set("notes", notes);
    formData.set("company", company);
    if (waiver) {
      formData.set("waiverAccepted", waiverAccepted ? "on" : "");
      formData.set("waiverVersion", String(waiver.version));
    }

    startTransition(async () => {
      const result = await registerForEventAction(eventId, formData);
      if ("error" in result) {
        setError({ message: result.error, step: result.step });
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
            <RecordAccountOffer
              offer={accountOffer}
              record={{ kind: "registration", id: registrationId }}
            />
          </div>
        )}
        {riderProfile && (
          <RiderProfileForm
            registrationId={registrationId}
            mountains={riderProfile.mountains}
          />
        )}
      </div>
    );
  }

  return (
    <RegistrationSteps
      error={error}
      isPending={isPending}
      onSubmit={handleSubmit}
      submitVariant="rainbow"
      details={
        <>
          {account?.email && (
            // One line, and no more than that. It says which session is
            // filling the fields in, so a shared browser can correct them; it
            // says nothing about what the organization knows.
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
          {/* Instagram and pronouns stay here rather than moving to the
              rider-profile step after registering (#1403). Neither is
              required, so #1259's objection to a step that can be abandoned
              does not bind them -- but that step writes only riding fields
              today, and the linked form has no step after at all, so moving
              them would mean a new write path to shorten a form the split
              has already shortened. */}
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
          {/* Asked of everyone, unconditionally (#1259). It is not gated on
              the email matching a directory record and it is not moved into
              the post-registration step: a question only some people see
              answers "do you have a record of me?", and a step after the
              write is one that can be abandoned. Placed with the questions
              about the person rather than with the ones about this
              attendance. */}
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
          {/* With the questions about this attendance rather than about the
              person, and immediately after the head count it qualifies: "four
              people" and "one of them is twelve" are one answer in two parts
              (#685). A field on the form rather than a step after the write,
              for the reason #1259 gives -- a step after the write is one that
              can be abandoned, and this is the one answer an organizer has to
              have before the day. */}
          <PartyIncludesMinorField
            id="registration-party-includes-minor"
            value={partyIncludesMinor}
            onChange={setPartyIncludesMinor}
            disabled={isPending}
          />
          {partyIncludesMinor === "yes" && (
            <MinorAccompanimentFields
              idPrefix="registration"
              paragraphs={minorAccompaniment}
              values={minorContacts}
              onChange={setMinorContacts}
              disabled={isPending}
            />
          )}
          {registrationOptions && (
            <RegistrationOptionCountsField
              idPrefix="registration"
              question={registrationOptions}
              counts={optionCounts}
              onChange={setOptionCountsState}
              partySize={Number(partySize)}
              disabled={isPending}
            />
          )}
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
        </>
      }
      // Never null here: the privacy notice is always on this form, so there
      // are always two steps.
      confirm={
        <>
          <PrivacyNotice surface="eventRegistration" />

          {/* #789's order of accumulation, and since #1376 it is two notices
              and then the one agreement the form actually takes. A notice
              belongs with the other notice: both say what happens to what you
              give us, neither asks for anything back, and putting them
              together leaves the box beneath them as the only control on the
              form carrying a real choice. Above the agreement rather than
              below it, because prose sitting under "I accept" reads as part
              of what is being accepted -- which is exactly the confusion the
              two shapes have to avoid (#686). */}
          <PhotoConsentNotice paragraphs={photoConsent} />

          {/* After the notice and beside the button, which is the order the
              artwork submission form argues for and for the same reason: the
              notice is the thing to read first, and the box that carries a
              real choice belongs next to the button that acts on it.

              Unticked, and `required` rather than a disabled submit, so the
              form can say which control is missing. The server refuses it
              independently -- see `accepted_waiver_version()` -- because a
              client-side `required` is a convenience and never the gate. */}
          {waiver && (
            <>
              {waiverBlock}
              <Field orientation="horizontal">
                <Checkbox
                  id="registration-waiver"
                  checked={waiverAccepted}
                  onCheckedChange={(next) => setWaiverAccepted(next === true)}
                  disabled={isPending}
                  required
                />
                <FieldLabel htmlFor="registration-waiver" required>
                  I have read and accept the {waiver.title}
                </FieldLabel>
              </Field>
            </>
          )}
        </>
      }
    />
  );
}
