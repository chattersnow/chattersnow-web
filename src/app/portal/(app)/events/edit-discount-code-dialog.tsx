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

function detailsFor(code: DiscountCode): DiscountCodeDetailsState {
  return {
    description: code.description ?? "",
    source: code.source ?? "",
    kind: code.kind ?? "",
    value: code.value === null ? "" : String(code.value),
  };
}

/**
 * One code's description, source, kind and value (#1588). Mounted only while
 * open, so it always starts from the row it was opened on.
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    setDiscountCodeDetails(formData, details);
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
      title={`Edit discount code ${code.code}`}
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
        <DiscountCodeDetailFields
          idPrefix="edit-discount-code"
          details={details}
          onChange={setDetails}
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
