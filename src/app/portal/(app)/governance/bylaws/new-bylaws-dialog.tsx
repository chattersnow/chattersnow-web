"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBylawsAction } from "./bylaws-actions";
import {
  BylawsFormFields,
  emptyBylawsForm,
  packBylawsFormData,
  type BylawsFormState,
} from "./bylaws-form-fields";
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

export function NewBylawsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BylawsFormState>(() => emptyBylawsForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof BylawsFormState>(
    key: K,
    value: BylawsFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(emptyBylawsForm());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createBylawsAction(packBylawsFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Bylaws version added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          Add bylaws version
        </Button>
      }
      title="Add bylaws version"
      description="Record the original bylaws or a new amendment."
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
              "Add bylaws version"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <BylawsFormFields form={form} update={update} idPrefix="new-bylaws" />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
