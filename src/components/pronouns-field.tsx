"use client";

import { useId, type ReactNode } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PRONOUNS_MAX_LENGTH, PRONOUN_SUGGESTIONS } from "@/lib/pronouns";

/**
 * The one pronouns input, shared by both public intake forms and both portal
 * edit forms so the wording, the suggestions and the length cap can't drift
 * between them.
 *
 * A free-text input with a datalist rather than a select: the suggestions make
 * the common answers one keystroke away without making them the only answers.
 * The datalist id comes from useId so several instances on one page (the
 * registration sheet and a person form, say) don't share a list.
 */
export function PronounsField({
  id,
  value,
  onChange,
  description = "Optional. We'll use these when we talk about you and when we introduce you at events.",
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const listId = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>Pronouns (optional)</FieldLabel>
      <Input
        id={id}
        list={listId}
        maxLength={PRONOUNS_MAX_LENGTH}
        placeholder="e.g. she/her"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {PRONOUN_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}
