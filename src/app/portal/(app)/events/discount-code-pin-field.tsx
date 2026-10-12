"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PIN_LENGTH } from "./discount-codes-form";

/** The partner's redemption PIN (#1589), shown and emailed with the code. */
export function DiscountCodePinField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>PIN</FieldLabel>
      <Input
        id={id}
        value={value}
        maxLength={MAX_PIN_LENGTH}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription>
        Only where the partner asks for one with the code. It is shown and
        emailed wherever the code is.
      </FieldDescription>
    </Field>
  );
}
