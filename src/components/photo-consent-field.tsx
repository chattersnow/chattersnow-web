"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  PHOTO_CONSENT_FORM_NOTE,
  PHOTO_CONSENT_HEADING,
  photoConsentLabel,
} from "@/lib/photo-consent";
import { cn } from "@/lib/utils";

/**
 * The photo and media consent question (#599).
 *
 * **Renders nothing at all when the organization has written no scope** — not
 * an empty box, not a bare heading, not the platform's own note. This is the
 * one place it diverges from `minor-accompaniment-fields.tsx`, which keeps
 * printing `MINOR_FORM_ASKS_FOR` on a blank tenant because the form is still
 * collecting a guardian's number either way. Here there is nothing to say,
 * because without a scope there is no question: what an organization does with
 * a photo is off-platform and unknowable from this codebase, and the platform
 * writes none of it (`docs/legal-basis.md` rule 2). A tenant that has written
 * nothing renders a form byte-identical to the one it had before this shipped.
 *
 * **The box starts unticked and is not `required`.** The waiver's box beneath
 * it is `required` because accepting it is a gate; this one is a real choice,
 * and a consent box that cannot be declined is not a consent box
 * (`docs/legal-basis.md`, "What submitting a public form means"). An unticked
 * box submits `"off"` and is stored as a decline, which is the state with an
 * operational job: it is the list somebody checks before pointing a camera.
 *
 * **No link.** The scope is these paragraphs and nothing else — there is no
 * `/photo-consent` route to point at, deliberately, and the DOM test asserts
 * zero anchors for the reason `volunteer-screening-notice.tsx` gives.
 */
export function PhotoConsentField({
  idPrefix,
  paragraphs,
  partyIncludesMinor = false,
  checked,
  onChange,
  disabled,
  className,
}: {
  idPrefix: string;
  /** The tenant's own scope. Empty on a tenant that has written none. */
  paragraphs: string[];
  /**
   * #685's answer, read from form state. It branches the **label** and not the
   * record: one column, one answer, worded in the capacity `/terms` already
   * claims the registering adult is answering in.
   */
  partyIncludesMinor?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const written = paragraphs.filter((paragraph) => paragraph.trim());
  if (written.length === 0) return null;

  const id = `${idPrefix}-photo-consent`;

  return (
    <div className={cn("space-y-2", className)}>
      {/* h3: the sheet's own title is the h2, and the page's h1 is above it. */}
      <h3 className="text-sm font-medium">{PHOTO_CONSENT_HEADING}</h3>
      {written.map((paragraph, index) => (
        <p key={index} className="app-muted text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
      <Field orientation="horizontal">
        {/* No `name`: both forms build their FormData in `handleSubmit` and
            set `PHOTO_CONSENT_FIELD` explicitly, which is the only way an
            unticked box can submit a real `"off"`. A native checkbox submits
            nothing when unticked, and nothing parses as "never asked" -- the
            one reading that would turn a decline into an absence. */}
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onChange(next === true)}
          disabled={disabled}
        />
        <FieldLabel htmlFor={id}>
          {photoConsentLabel(partyIncludesMinor)}
        </FieldLabel>
      </Field>
      <FieldDescription>{PHOTO_CONSENT_FORM_NOTE}</FieldDescription>
    </div>
  );
}
