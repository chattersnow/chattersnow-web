"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMAIL_DETAIL_DESCRIPTION,
  NO_INSTAGRAM_LABEL,
  PREFERRED_CONTACT_DETAIL_MAX,
  PREFERRED_CONTACT_METHODS,
  preferredContactDetailLabel,
  type ContactValues,
} from "@/lib/registration-contact";

/**
 * The Instagram handle, or -- where the organization requires one (#1647) --
 * "I don't have Instagram" and a preferred way to be reached instead.
 *
 * One component for both registration forms, the registrant's own card on
 * `/my` and the answers link, and the staff sheet, so the wording and the
 * shape cannot drift between them. With `required` off it is the optional
 * handle field the forms always had, and nothing else.
 */
export function InstagramOrContactFields({
  idPrefix,
  values,
  onChange,
  required,
  offerNoInstagram = required,
  disabled,
  instagramLabel = "Instagram handle",
  emailDescription = EMAIL_DETAIL_DESCRIPTION,
}: {
  idPrefix: string;
  values: ContactValues;
  onChange: (next: ContactValues) => void;
  /** The tenant's `registration.requires_instagram`. */
  required: boolean;
  /**
   * Whether to offer "I don't have Instagram". Follows `required`, except for
   * staff, who can record either answer without being held to one.
   */
  offerNoInstagram?: boolean;
  disabled?: boolean;
  instagramLabel?: string;
  /** What a blank email detail means; staff read it as the registrant's. */
  emailDescription?: string;
}) {
  const set = (patch: Partial<ContactValues>) =>
    onChange({ ...values, ...patch });
  const noInstagram = offerNoInstagram && values.hasNoInstagram;

  return (
    <>
      {!noInstagram && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-instagram`} required={required}>
            {instagramLabel}
          </FieldLabel>
          <Input
            id={`${idPrefix}-instagram`}
            placeholder="e.g. yourhandle"
            autoComplete="off"
            required={required}
            disabled={disabled}
            value={values.instagramHandle}
            onChange={(event) => set({ instagramHandle: event.target.value })}
          />
        </Field>
      )}
      {offerNoInstagram && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-no-instagram`}
            checked={values.hasNoInstagram}
            disabled={disabled}
            onCheckedChange={(next) => set({ hasNoInstagram: next === true })}
          />
          <FieldLabel htmlFor={`${idPrefix}-no-instagram`}>
            {NO_INSTAGRAM_LABEL}
          </FieldLabel>
        </Field>
      )}
      {noInstagram && (
        <>
          <Field>
            <FieldLabel
              htmlFor={`${idPrefix}-contact-method`}
              required={required}
            >
              Preferred contact method
            </FieldLabel>
            <Select
              // `""` is a value to Base UI; null shows the placeholder.
              value={values.method || null}
              disabled={disabled}
              onValueChange={(next) => set({ method: String(next ?? "") })}
            >
              <SelectTrigger
                id={`${idPrefix}-contact-method`}
                className="w-full"
              >
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {PREFERRED_CONTACT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel
              htmlFor={`${idPrefix}-contact-detail`}
              required={required && values.method !== "email"}
            >
              {preferredContactDetailLabel(values.method)}
            </FieldLabel>
            <Input
              id={`${idPrefix}-contact-detail`}
              type={
                values.method === "email"
                  ? "email"
                  : values.method === "other"
                    ? "text"
                    : "tel"
              }
              maxLength={PREFERRED_CONTACT_DETAIL_MAX}
              required={required && values.method !== "email"}
              disabled={disabled}
              value={values.detail}
              onChange={(event) => set({ detail: event.target.value })}
            />
            {values.method === "email" && (
              <FieldDescription>{emailDescription}</FieldDescription>
            )}
          </Field>
        </>
      )}
    </>
  );
}
