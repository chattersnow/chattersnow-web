"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updatePersonAction } from "./actions";
import {
  PersonFormFields,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import type { PersonRow } from "./people-shared";
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
import { FieldGroup } from "@/components/ui/field";

function formStateFor(person: PersonRow): PersonFormState {
  return {
    name: person.name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    notes: person.notes ?? "",
    roles: {
      is_donor: person.is_donor,
      is_sponsor: person.is_sponsor,
      is_volunteer: person.is_volunteer,
    },
  };
}

export function EditPersonModal({ person }: { person: PersonRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PersonFormState>(() => formStateFor(person));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(person));
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updatePersonAction(person.id, packPersonFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit person" />}
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit person</DialogTitle>
          <DialogDescription>Update this person&apos;s contact details and roles.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <PersonFormFields form={form} update={update} idPrefix="edit-person" />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
