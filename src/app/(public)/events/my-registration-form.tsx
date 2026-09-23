"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";
import { AttendedBeforeField } from "@/components/attended-before-field";
import {
  EMPTY_MINOR_CONTACTS,
  MinorAccompanimentFields,
  type MinorContactValues,
} from "@/components/minor-accompaniment-fields";
import { PartyIncludesMinorField } from "@/components/party-includes-minor-field";
import { PhotoConsentNotice } from "@/components/photo-consent-notice";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { registerMyselfForEventAction } from "./my-registration-actions";
import type { WaiverOnFile } from "./my-registration";

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
  waiver = null,
  waiverBlock = null,
  waiverOnFile = null,
  minorAccompaniment = [],
  photoConsent = [],
}: {
  eventId: string;
  person: MyContactDetails;
  /**
   * The participant agreement's version, when this organization takes one
   * (#686). Asked of a signed-in caller exactly as it is of an anonymous one:
   * holding an account is not agreement to anything, and a path that skipped
   * it would be the shortest way to a registration with nothing behind it.
   */
  waiver?: { version: number; title: string } | null;
  /** The agreement itself, rendered on the server. */
  waiverBlock?: React.ReactNode;
  /**
   * The acceptance this person already has on file (#1401). When it is for
   * the version being shown, the agreement and its box give way to one line
   * saying so, and the RPC copies the acceptance onto the registration. A
   * different version -- the page raced a republish -- asks in full.
   */
  waiverOnFile?: WaiverOnFile | null;
  /**
   * This organization's rule for a party that includes anyone under 18
   * (#685). Empty on a tenant that has written none.
   */
  minorAccompaniment?: string[];
  /**
   * This organization's photos-and-video paragraphs (#599, #1376). Empty on a
   * tenant that has written none, and empty means the form says nothing at
   * all. Shown to a signed-in caller exactly as to an anonymous one: holding
   * an account is not permission to photograph anybody, and it is not a reason
   * to tell somebody less.
   */
  photoConsent?: string[];
}) {
  const [phone, setPhone] = useState(person.phone ?? "");
  const [pronouns, setPronouns] = useState(person.pronouns ?? "");
  const [instagramHandle, setInstagramHandle] = useState(
    person.instagram_handle ?? "",
  );
  const [partySize, setPartySize] = useState("1");
  // Empty until they say otherwise (#1259). Deliberately not seeded from
  // `my_event_history()`: prefilling it would cost this public page a second
  // round trip to pre-tick a control that is one click either way, and it
  // would blur the one self-reported answer into the derived figure it exists
  // to sit beside.
  const [attendedBefore, setAttendedBefore] = useState("");
  // #685. Required here as on the anonymous form, and starting empty for the
  // same reason: holding an account says nothing about who is coming with you.
  const [partyIncludesMinor, setPartyIncludesMinor] = useState("");
  const [minorContacts, setMinorContacts] =
    useState<MinorContactValues>(EMPTY_MINOR_CONTACTS);
  const [notes, setNotes] = useState("");
  // Unticked, always (#686).
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onFile =
    waiver && waiverOnFile?.version === waiver.version ? waiverOnFile : null;

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
    formData.set("attendedBefore", attendedBefore);
    formData.set("partyIncludesMinor", partyIncludesMinor);
    if (partyIncludesMinor === "yes") {
      for (const [key, value] of Object.entries(minorContacts)) {
        formData.set(key, value);
      }
    }
    if (waiver) {
      // Nothing ticked when it is on file: there was no box. The version still
      // goes, so a republish since this page rendered is refused as a change
      // rather than as a box they were never shown (#1401).
      formData.set("waiverAccepted", waiverAccepted && !onFile ? "on" : "");
      formData.set("waiverVersion", String(waiver.version));
    }

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

        {/* The same question the anonymous form asks, in the same words, from
            the same component (#1259). This reader is the one place the ticket
            allows it to be skipped or prefilled from their own history, and it
            is neither: a self-reported answer is a different fact from the
            check-in ledger, and the ledger only knows the events this tenant
            ran here. */}
        <AttendedBeforeField
          id="my-registration-attended-before"
          value={attendedBefore}
          onChange={setAttendedBefore}
        />

        {/* The same question the anonymous form asks, in the same words, from
            the same component (#685). A signed-in caller is not exempt: an
            account says who is registering and nothing about who is coming
            with them. */}
        <PartyIncludesMinorField
          id="my-registration-party-includes-minor"
          value={partyIncludesMinor}
          onChange={setPartyIncludesMinor}
          disabled={isPending}
        />
        {partyIncludesMinor === "yes" && (
          <MinorAccompanimentFields
            idPrefix="my-registration"
            paragraphs={minorAccompaniment}
            values={minorContacts}
            onChange={setMinorContacts}
            disabled={isPending}
          />
        )}

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

        {/* Above the agreement, the same order the anonymous form uses and for
            the same reason: prose sitting beneath "I accept" reads as part of
            what is being accepted. This form carries no privacy notice of its
            own -- that is #684's territory and a signed-in caller has already
            been told -- so this is the only notice here, and the waiver's box
            below it is the only control taking anything (#1376). */}
        <PhotoConsentNotice paragraphs={photoConsent} />

        {/* Immediately above the button that acts on it, the same placement
            the anonymous form uses. This form carries no privacy notice --
            that is #684's territory and a signed-in caller has already been
            told -- so the agreement is the last thing read before submitting.
            The server refuses an unticked box independently of the `required`
            here; see `accepted_waiver_version()`. */}
        {waiver && onFile && (
          /* Already accepted, this version (#1401). One line in place of the
             longest block on the form, and still a link to the words, since
             having agreed to something is no reason not to be able to read
             it again. A republish makes this disappear on its own: the RPC
             behind `onFile` only answers for the version in force. */
          <p className="app-muted text-sm">
            {waiver.title} v{waiver.version} · accepted{" "}
            {/* The browser's own zone, like every date a reader is shown
                about themselves, so the server's rendering of it can differ
                by a day at the edges. */}
            <time dateTime={onFile.accepted_at} suppressHydrationWarning>
              {formatAcceptedDay(onFile.accepted_at)}
            </time>{" "}
            ·{" "}
            <Link
              href={`/waiver?version=${waiver.version}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${waiver.title}, version ${waiver.version}, in a new tab`}
              className="hover:text-foreground underline underline-offset-4"
            >
              view
            </Link>
          </p>
        )}

        {waiver && !onFile && (
          <>
            {waiverBlock}
            {/* No `scroll-mb-*` against the pinned submit below (#1375). The
                thought was that the browser scrolls an unticked required box
                into view and anchors its bubble there, so the button could
                cover it -- but `Checkbox` is base-ui, whose real input is a
                1px `position: fixed` element parked at the viewport corner.
                That is what constraint validation sees, so nothing scrolls
                and the bubble never comes near this row. Verified in Chrome:
                submitting unticked leaves `scrollY` untouched. */}
            <Field orientation="horizontal">
              <Checkbox
                id="my-registration-waiver"
                checked={waiverAccepted}
                onCheckedChange={(next) => setWaiverAccepted(next === true)}
                disabled={isPending}
                required
              />
              <FieldLabel htmlFor="my-registration-waiver" required>
                I have read and accept the {waiver.title}
              </FieldLabel>
            </Field>
          </>
        )}

        {/* Named apart from the disclosure's "Register" trigger above it
            (#1256), the same way the anonymous form's submit is.

            Sticky on the button itself, with no wrapper (#1375). A sticky
            element is bounded by its containing block, so this only travels
            because its containing block is the tall `FieldGroup` spanning
            the whole form -- the `Field` that used to wrap it would have
            shrunk that box to the button and stopped it pinning. It is also
            the last child, so nothing in flow sits below it and it settles
            back into place, `gap-5` above it, at full scroll. `bg-primary`
            is opaque, so it needs no bar, border or blur to keep text from
            reading through it. The `env()` resolves to 0 until a layout
            exports `viewport-fit=cover`. */}
        <Button
          type="submit"
          disabled={isPending}
          className="sticky bottom-[max(env(safe-area-inset-bottom),1rem)] z-10 w-full shadow-lg sm:w-fit"
        >
          {isPending ? "Registering…" : "Complete registration"}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** "Oct 4, 2026", in the reader's own zone. */
function formatAcceptedDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
