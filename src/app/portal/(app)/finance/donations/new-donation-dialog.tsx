"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDonationAction } from "./actions";
import {
  DonationFormFields,
  emptyDonationForm,
  packDonationFormData,
  type DonationFormState,
} from "./donation-form-fields";
import type { EventOption } from "./donations-shared";
import type { PersonListItem } from "../../people/actions";
import type { PickedPerson } from "../../people/person-picker";
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
import { Spinner } from "@/components/ui/spinner";

export function NewDonationDialog({
  events,
  people,
}: {
  events: EventOption[];
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DonationFormState>(() =>
    emptyDonationForm(),
  );
  const [peopleOptions, setPeopleOptions] = useState<PersonListItem[]>(people);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof DonationFormState>(
    key: K,
    value: DonationFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeopleOptions((prev) => [
      ...prev,
      { ...person, is_sponsor: false } as PersonListItem,
    ]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(emptyDonationForm());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createDonationAction(packDonationFormData(form));
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
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        New donation
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add donation</DialogTitle>
          <DialogDescription>
            Record a monetary donation received.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <DonationFormFields
              form={form}
              update={update}
              events={events}
              people={peopleOptions}
              onPersonCreated={handlePersonCreated}
              idPrefix="new-donation"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add donation"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
