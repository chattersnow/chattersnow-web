"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMilestoneAction } from "./nonprofit-status-actions";
import {
  NonprofitStatusFormFields,
  emptyMilestoneForm,
  packMilestoneFormData,
  type MilestoneFormState,
} from "./nonprofit-status-form-fields";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function NewMilestoneDialog({
  people,
  existingPhases,
}: {
  people: PersonListItem[];
  existingPhases: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<MilestoneFormState>(() =>
    emptyMilestoneForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof MilestoneFormState>(
    key: K,
    value: MilestoneFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedOwner(null);
      setForm(emptyMilestoneForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createMilestoneAction(
        selectedOwner?.id ?? null,
        packMilestoneFormData(form),
      );
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
        Add milestone
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
          <DialogDescription>
            Track a step toward 501(c)(3) status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Owner</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={selectedOwner}
                onSelect={setSelectedOwner}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            <NonprofitStatusFormFields
              form={form}
              update={update}
              idPrefix="new-milestone"
              existingPhases={existingPhases}
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Add milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
