import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Shared requester contact fields (name/email/phone/notes), used by both
// the single-item request form (gear-request-form-fields.tsx) and the cart
// checkout form (gear-cart-checkout-form.tsx) so the two flows stay
// visually and behaviorally identical. idPrefix keeps input ids unique
// since both forms can exist in the DOM in the same page (detail sheet +
// cart sheet).
export function GearRequesterFields({
  idPrefix,
  name,
  onNameChange,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  notes,
  onNotesChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          autoComplete="name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
          />
        </Field>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </Field>
    </>
  );
}
