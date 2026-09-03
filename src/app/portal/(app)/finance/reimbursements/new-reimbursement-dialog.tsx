"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReimbursementAction } from "./actions";
import {
  ReimbursementFormFields,
  emptyReimbursementForm,
  packReimbursementFormData,
  type ReimbursementFormState,
} from "./reimbursement-form-fields";
import type { EventOption } from "./reimbursements-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function NewReimbursementDialog({
  people,
  events,
  defaultEventId,
}: {
  people: PersonListItem[];
  events: EventOption[];
  defaultEventId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<ReimbursementFormState>(() =>
    emptyReimbursementForm(defaultEventId),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ReimbursementFormState>(
    key: K,
    value: ReimbursementFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const baseline = emptyReimbursementForm(defaultEventId);
  const dirty =
    selectedPerson !== null ||
    (Object.keys(baseline) as (keyof ReimbursementFormState)[]).some(
      (key) => form[key] !== baseline[key],
    );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setSelectedPerson(null);
    setForm(emptyReimbursementForm(defaultEventId));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!guard.allowOpenChange(nextOpen)) return;
    setOpen(nextOpen);
    if (nextOpen) resetForm();
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedPerson) {
      setError("Select or create who is requesting reimbursement.");
      return;
    }

    startTransition(async () => {
      const result = await createReimbursementAction(
        packReimbursementFormData(form, selectedPerson.id),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Reimbursement request submitted.");
      router.refresh();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this reimbursement request"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button type="button" className="shrink-0 whitespace-nowrap" />
          }
        >
          New Reimbursement
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add reimbursement</DialogTitle>
            <DialogDescription>
              Record a new reimbursement request.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel>Requester</FieldLabel>
                <PersonPicker
                  people={availablePeople}
                  selected={selectedPerson}
                  onSelect={setSelectedPerson}
                  onPersonCreated={handlePersonCreated}
                />
              </Field>

              <ReimbursementFormFields
                form={form}
                update={update}
                events={events}
                idPrefix="new-reimbursement"
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
                  "Add reimbursement"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
