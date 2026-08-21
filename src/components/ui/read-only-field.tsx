import type { ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";

export function ReadOnlyField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <p id={htmlFor} className="text-sm text-foreground">
        {children}
      </p>
    </Field>
  );
}
