"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { PHOTO_CONSENT_HEADING, photoConsentLabel } from "@/lib/photo-consent";
import { setMyPhotoConsentAction } from "./photo-consent-actions";

/**
 * Changing your mind about being photographed, from your own registration
 * (#599).
 *
 * **A consent that cannot be withdrawn is not consent.** That is the whole
 * reason this exists and the reason nothing like it exists for the participant
 * waiver: an acceptance records an act that happened, and a permission is
 * either still given or is not. `/terms` promises a takedown route by email
 * too, and this is the one that does not depend on somebody reading a mailbox.
 *
 * It renders only where the organization is asking — if the scope has been
 * emptied there is no question to answer and `set_my_photo_consent()` would
 * refuse the write anyway, so offering a control would be offering something
 * that cannot be saved.
 *
 * The paragraphs are **today's** scope, not the snapshot on the row: somebody
 * changing their answer is answering the words as they read now, and that is
 * what the RPC re-snapshots. Where the two differ, showing the old one would
 * be asking them to agree to text that is no longer the organization's.
 *
 * `consent === null` means nobody asked when they registered — a row from
 * before the scope was written, or a walk-in. The box starts unticked in that
 * case, which is not a stored decline: nothing is written until they save.
 */
export function PhotoConsentCard({
  registrationId,
  paragraphs,
  consent,
}: {
  registrationId: string;
  /** The organization's scope as it reads now. Never rendered when empty. */
  paragraphs: string[];
  /** Their stored answer, or null when they were never asked. */
  consent: boolean | null;
}) {
  const [checked, setChecked] = useState(consent === true);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const written = paragraphs.filter((paragraph) => paragraph.trim());
  if (written.length === 0) return null;

  const stored = saved ?? consent;
  const unchanged = stored === checked;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setMyPhotoConsentAction(registrationId, checked);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(result.consent);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="text-base font-medium">{PHOTO_CONSENT_HEADING}</h2>
        {written.map((paragraph, index) => (
          <p key={index} className="app-muted text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}

        {/* What is on the record now, said plainly and including the decline.
            Somebody checking whether their "no" actually stuck is the main
            reason to open this page. */}
        <p className="text-sm">
          {stored === null
            ? "We did not ask you about this when you registered, so there is nothing on your record yet."
            : stored
              ? "Right now your record says you are happy to be photographed."
              : "Right now your record says you would rather not be photographed."}
        </p>

        <Field orientation="horizontal">
          <Checkbox
            id="my-photo-consent"
            checked={checked}
            onCheckedChange={(next) => setChecked(next === true)}
            disabled={isPending}
          />
          <FieldLabel htmlFor="my-photo-consent">
            {photoConsentLabel(false)}
          </FieldLabel>
        </Field>
        <FieldDescription>
          You can change this as often as you like, and it takes effect as soon
          as you save.
        </FieldDescription>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={save} disabled={isPending || unchanged}>
          {isPending ? "Saving…" : "Save this answer"}
        </Button>
      </CardContent>
    </Card>
  );
}
