"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPolicyAction } from "./policies-actions";
import {
  PolicyFormFields,
  emptyPolicyForm,
  packPolicyFormData,
  type PolicyFormState,
} from "./policy-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export function NewPolicyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PolicyFormState>(() => emptyPolicyForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(emptyPolicyForm());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createPolicyAction(packPolicyFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Policy added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add policy
        </Button>
      }
      title="Add policy"
      description="Record a named organizational policy."
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
              "Add policy"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <PolicyFormFields form={form} update={update} idPrefix="new-policy" />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
