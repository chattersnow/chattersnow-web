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
import type { PersonListItem } from "../../people/actions";
import type { ServiceRow } from "@/lib/portal/access-management/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        New asset
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>
            Record an external technology asset and who owns/administers it.
            This is not a credential store -- never enter a password, API key,
            token, or recovery code here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending ? (
                <>
                  <Spinner /> Creating...
                </>
              ) : (
                "Add asset"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
