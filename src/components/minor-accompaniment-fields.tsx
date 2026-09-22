"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MINOR_CONTACT_LABELS,
  MINOR_FORM_ASKS_FOR,
  MINOR_THIRD_PARTY_NOTE,
} from "@/lib/minors";
import { cn } from "@/lib/utils";

export type MinorContactValues = {
  accompanyingAdultName: string;
  accompanyingAdultPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export const EMPTY_MINOR_CONTACTS: MinorContactValues = {
  accompanyingAdultName: "",
  accompanyingAdultPhone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

/**
 * What a registrant sees once they answer yes (#685).
 *
 * Three things, of three different kinds, and the seams between them are the
 * whole design — the same split `volunteer-screening-notice.tsx` makes (#690),
 * under `docs/legal-basis.md` rule 2.
 *
 * `paragraphs` are **the organization's rule**, `events.minor_accompaniment`,
 * blank until somebody writes it. Whether a guardian must stay for the whole
 * event, whether they register and count in the party size, whether there is
 * an age floor — none of that is knowable from this codebase, and a platform
 * default would be a policy invented for an organization that has adopted
 * none. The heading renders only with paragraphs under it: "If anyone in your
 * party is under 18" over nothing would be a rule nobody wrote.
 *
 * `MINOR_FORM_ASKS_FOR` is **a fact about this software** — these four fields
 * and no date of birth — so it renders on every tenant, written or not. It is
 * protective rather than decorative: the moment somebody answers yes, this
 * form is collecting a child's guardian's mobile number, and where they are
 * typing it is the place to say what is and is not asked for.
 *
 * `MINOR_THIRD_PARTY_NOTE` is there because the emergency contact is the only
 * person this product holds details of who never came to the site. They cannot
 * be given notice at the point of collection, so the person entering their
 * number is asked to give it instead.
 *
 * Nothing here is accepted. No checkbox, no stored version pointer (#1318):
 * the one box on this form carrying a real choice is the participant
 * agreement's (#686), and a second box that cannot be declined would dilute
 * it.
 */
export function MinorAccompanimentFields({
  idPrefix,
  paragraphs,
  values,
  onChange,
  disabled,
  className,
}: {
  idPrefix: string;
  /** The tenant's own rule. Empty on a tenant that has written none. */
  paragraphs: string[];
  values: MinorContactValues;
  onChange: (values: MinorContactValues) => void;
  disabled?: boolean;
  className?: string;
}) {
  const written = paragraphs.filter((paragraph) => paragraph.trim());
  const set = (key: keyof MinorContactValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        {written.length > 0 && (
          <>
            {/* h3: the sheet's own title is the h2, and the page's h1 is above
                that. */}
            <h3 className="text-sm font-medium">
              If anyone in your party is under 18
            </h3>
            {written.map((paragraph, index) => (
              <p key={index} className="app-muted text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
          </>
        )}
        <p className="app-muted text-sm leading-relaxed">
          {MINOR_FORM_ASKS_FOR}
        </p>
      </div>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-adult-name`} required>
            {MINOR_CONTACT_LABELS.accompanyingAdultName}
          </FieldLabel>
          <Input
            id={`${idPrefix}-adult-name`}
            required
            autoComplete="off"
            disabled={disabled}
            value={values.accompanyingAdultName}
            onChange={(event) =>
              set("accompanyingAdultName")(event.target.value)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-adult-phone`} required>
            {MINOR_CONTACT_LABELS.accompanyingAdultPhone}
          </FieldLabel>
          <Input
            id={`${idPrefix}-adult-phone`}
            type="tel"
            required
            autoComplete="off"
            disabled={disabled}
            value={values.accompanyingAdultPhone}
            onChange={(event) =>
              set("accompanyingAdultPhone")(event.target.value)
            }
          />
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-emergency-name`} required>
            {MINOR_CONTACT_LABELS.emergencyContactName}
          </FieldLabel>
          <Input
            id={`${idPrefix}-emergency-name`}
            required
            autoComplete="off"
            disabled={disabled}
            value={values.emergencyContactName}
            onChange={(event) =>
              set("emergencyContactName")(event.target.value)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-emergency-phone`} required>
            {MINOR_CONTACT_LABELS.emergencyContactPhone}
          </FieldLabel>
          <Input
            id={`${idPrefix}-emergency-phone`}
            type="tel"
            required
            autoComplete="off"
            disabled={disabled}
            value={values.emergencyContactPhone}
            onChange={(event) =>
              set("emergencyContactPhone")(event.target.value)
            }
          />
        </Field>
      </Field>
      <FieldDescription>{MINOR_THIRD_PARTY_NOTE}</FieldDescription>
    </div>
  );
}
