"use client";

import { FormEvent, useState, useTransition } from "react";
import { createDiscountCodesAction } from "./discount-codes-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  DiscountCodeDetailFields,
  emptyDiscountCodeDetails,
  setDiscountCodeDetails,
} from "./discount-code-detail-fields";
import { useCoverableOptions } from "./use-coverable-options";

export function AddDiscountCodesDialog({
  eventId,
  triggerLabel = "+ Add codes",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState("");
  const [details, setDetails] = useState(emptyDiscountCodeDetails);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const options = useCoverableOptions(eventId, open);

  function reset() {
    setCodes("");
    setDetails(emptyDiscountCodeDetails());
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("codes", codes);
    setDiscountCodeDetails(formData, details);

    startTransition(async () => {
      const result = await createDiscountCodesAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
        >
          {triggerLabel}
        </Button>
      }
      title="Add discount codes"
      description="Add a batch of single-use discount codes for this event. Each one goes to one registrant."
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
              "Add codes"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="discount-codes-batch">
            Codes (one per line)
          </FieldLabel>
          <Textarea
            id="discount-codes-batch"
            placeholder={"SPRING10\nSPRING11, 4821\nSPRING12, 9930"}
            value={codes}
            onChange={(event) => setCodes(event.target.value)}
            rows={6}
          />
          <FieldDescription>
            Where the partner gives a PIN, put it after the code with a comma or
            a tab, so a partner&apos;s CSV can be pasted in.
          </FieldDescription>
        </Field>

        <DiscountCodeDetailFields
          idPrefix="discount-codes"
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
