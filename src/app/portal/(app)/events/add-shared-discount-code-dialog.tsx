"use client";

import { FormEvent, useState, useTransition } from "react";
import { createSharedDiscountCodeAction } from "./discount-codes-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  DiscountCodeDetailFields,
  emptyDiscountCodeDetails,
  setDiscountCodeDetails,
} from "./discount-code-detail-fields";
import { DiscountCodePinField } from "./discount-code-pin-field";
import { useCoverableOptions } from "./use-coverable-options";

/**
 * The event's one shared code (#1589): a partner's group code for everybody
 * who registers. It is never assigned; the confirmation email carries it.
 */
export function AddSharedDiscountCodeDialog({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [details, setDetails] = useState(emptyDiscountCodeDetails);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const options = useCoverableOptions(eventId, open);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setCode("");
      setPin("");
      setDetails(emptyDiscountCodeDetails());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("code", code);
    formData.set("pin", pin);
    setDiscountCodeDetails(formData, details);
    startTransition(async () => {
      const result = await createSharedDiscountCodeAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      onSaved();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="secondary" size="sm">
          + Add shared code
        </Button>
      }
      title="Add a shared code"
      description="One code for everyone who registers. It goes out in every registration confirmation email."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add shared code"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="shared-discount-code" required>
              Code
            </FieldLabel>
            <Input
              id="shared-discount-code"
              value={code}
              required
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <DiscountCodePinField
            id="shared-discount-code-pin"
            value={pin}
            onChange={setPin}
          />
        </Field>
        <DiscountCodeDetailFields
          idPrefix="shared-discount-code"
          details={details}
          onChange={setDetails}
          options={options}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
