"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateAssetAction } from "../../actions";
import {
  AssetFormFields,
  packAssetFormData,
  type AssetFormState,
} from "../../asset-form-fields";
import type { PersonListItem } from "../../../../people/actions";
import type {
  AssetDetail,
  ServiceRow,
} from "@/lib/portal/access-management/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function formStateFor(asset: AssetDetail): AssetFormState {
  return {
    name: asset.name,
    service_id: asset.service_id,
    category: asset.category,
    description: asset.description ?? "",
    url: asset.url ?? "",
    is_org_owned: asset.is_org_owned,
    owner_person_id: asset.owner_person_id,
    primary_admin_person_id: asset.primary_admin_person_id,
    backup_admin_person_id: asset.backup_admin_person_id,
    status: asset.status,
    sensitivity: asset.sensitivity,
    mfa_required: asset.mfa_required,
    mfa_status: asset.mfa_status,
    recovery_documented: asset.recovery_documented,
    recovery_owner_person_id: asset.recovery_owner_person_id,
    credential_management_location: asset.credential_management_location,
    notes: asset.notes ?? "",
  };
}

export function EditAssetSheet({
  asset,
  services,
  people,
}: {
  asset: AssetDetail;
  services: ServiceRow[];
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetFormState>(() => formStateFor(asset));
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
    if (nextOpen) {
      setForm(formStateFor(asset));
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAssetAction(asset.id, packAssetFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="secondary" />}>
        <Pencil /> Edit
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit asset</SheetTitle>
          <SheetDescription>
            Update this asset&apos;s details, ownership, and MFA/recovery
            posture.
          </SheetDescription>
        </SheetHeader>

        <form
          id="edit-asset-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <AssetFormFields
              idPrefix="edit-asset"
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
          </div>
        </form>

        <SheetFooter className="border-t bg-muted/50">
          <Button type="submit" form="edit-asset-form" disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
