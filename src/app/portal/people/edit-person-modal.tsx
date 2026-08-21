"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updatePersonAction } from "./actions";
import {
  PersonFormFields,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import type { PersonRow } from "./people-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit person" />}
      >
        <Pencil />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-lg">
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <SheetClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
          >
            <ArrowLeft />
          </SheetClose>
          <div className="flex flex-col gap-0.5">
            <SheetTitle>Edit person</SheetTitle>
            <SheetDescription>Update this person&apos;s contact details and roles.</SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <PersonFormFields form={form} update={update} idPrefix="edit-person" />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>

          <SheetFooter className="flex-row justify-end border-t bg-muted/50">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
