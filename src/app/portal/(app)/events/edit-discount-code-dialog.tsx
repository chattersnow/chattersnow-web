"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  updateDiscountCodeAction,
  type DiscountCode,
} from "./discount-codes-actions";
import {
  DiscountCodeDetailFields,
  setDiscountCodeDetails,
  type DiscountCodeDetailsState,
} from "./discount-code-detail-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useCoverableOptions } from "./use-coverable-options";
import { DiscountCodePinField } from "./discount-code-pin-field";

function detailsFor(code: DiscountCode): DiscountCodeDetailsState {
  return {
    description: code.description ?? "",
    source: code.source ?? "",
    kind: code.kind ?? "",
    value: code.value === null ? "" : String(code.value),
    coverage: Object.fromEntries(
      (code.coverage ?? []).map((row) => [
        row.option_id,
        String(Number(row.percent_off)),
      ]),
    ),
  };
}

/**
 * One code's description, source, kind and value (#1588), and its PIN and the
 * options it covers (#1589). Mounted only while open, so it always starts from
 * the row it was opened on.
 */
export function EditDiscountCodeDialog({
  code,
  onClose,
  onSaved,
}: {
  code: DiscountCode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState(() => detailsFor(code));
  const [pin, setPin] = useState(code.pin ?? "");
  const options = useCoverableOptions(code.event_id, true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    setDiscountCodeDetails(formData, details);
    formData.set("pin", pin);
    startTransition(async () => {
      const result = await updateDiscountCodeAction(code.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  return (
    <PortalFormSurface
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        code.shared
          ? `Edit shared code ${code.code}`
          : `Edit discount code ${code.code}`
      }
      description="What this code is, where it came from, and what it is worth."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <DiscountCodePinField
          id="edit-discount-code-pin"
          value={pin}
          onChange={setPin}
        />
        <DiscountCodeDetailFields
          idPrefix="edit-discount-code"
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
