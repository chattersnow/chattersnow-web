"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PARTY_INCLUDES_MINOR_DESCRIPTION,
  PARTY_INCLUDES_MINOR_OPTIONS,
  PARTY_INCLUDES_MINOR_QUESTION,
} from "@/lib/minors";

/**
 * The one "is anyone in your party under 18?" control (#685), shared by the
 * anonymous registration form and the register-as-yourself form so the
 * wording cannot drift between them — and, more to the point, so neither can
 * start asking it differently from the other.
 *
 * **Required, unlike `AttendedBeforeField`**, and the difference is the whole
 * point. Nothing turns on whether somebody has been before, so leaving that
 * question alone is a real third answer. Here the accompanying-adult block,
 * the organizer's flag and the organization's own rule all hang off this one
 * value, and an unanswered question leaves exactly the gap the ticket exists
 * to close. There is no "rather not say" option for that reason.
 *
 * The column behind it is still nullable, and null still means *nobody was
 * asked*: rows written before this shipped, walk-ins added by staff, and
 * callers of the public API, whose published contract cannot be made to
 * answer a new question retroactively. A required control on the form and a
 * three-state column are not in tension — one is what we ask, the other is
 * what we know.
 *
 * Nothing about it varies with who is asking, the same rule `attended_before`
 * is written under: a control that behaved differently would tell the reader
 * whether the organization has a record of them.
 */
export function PartyIncludesMinorField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** `""` before an answer is picked; otherwise one of the option values. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} required>
        {PARTY_INCLUDES_MINOR_QUESTION}
      </FieldLabel>
      <Select
        // `""` is a value as far as Base UI is concerned and would paint an
        // empty trigger over the placeholder, so the unanswered state is
        // mapped to null here rather than leaking a second spelling of it out
        // to both call sites.
        value={value || null}
        disabled={disabled}
        required
        onValueChange={(next) => onChange(String(next ?? ""))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select one" />
        </SelectTrigger>
        <SelectContent>
          {PARTY_INCLUDES_MINOR_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{PARTY_INCLUDES_MINOR_DESCRIPTION}</FieldDescription>
    </Field>
  );
}
