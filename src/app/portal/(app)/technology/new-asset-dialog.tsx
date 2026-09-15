"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAssetAction } from "./actions";
import {
  AssetFormFields,
  emptyAssetForm,
  packAssetFormData,
  type AssetFormState,
} from "./asset-form-fields";
import type { PersonListItem } from "../people/actions";
import type { ServiceRow } from "@/lib/portal/access-management/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export function NewAssetDialog({
  services,
  people,
}: {
  services: ServiceRow[];
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetFormState>(emptyAssetForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof AssetFormState>(
    key: K,
    value: AssetFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(emptyAssetForm());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createAssetAction(packAssetFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Asset added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          New asset
        </Button>
      }
      title="Add asset"
      description="Record an external technology asset and who owns/administers it. This is not a credential store -- never enter a password, API key, token, or recovery code here."
      size="xl"
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || !form.name.trim()}>
            {isPending ? (
              <>
                <Spinner /> Creating...
              </>
            ) : (
              "Add asset"
            )}
          </Button>
        </>
      }
    >
      <RequiredFieldsNote />
      <AssetFormFields
        idPrefix="new-asset"
        form={form}
        update={update}
        services={services}
        people={people}
      />

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </PortalFormSurface>
  );
}
