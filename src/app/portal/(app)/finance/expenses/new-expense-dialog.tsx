"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createExpenseAction } from "./actions";
import {
  ExpenseFormFields,
  emptyExpenseForm,
  packExpenseFormData,
  type ExpenseFormState,
} from "./expense-form-fields";
import type { EventOption } from "./expenses-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { listEventOptionsAction } from "../../events/actions";
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

export function NewExpenseDialog({
  events,
  defaultEventId,
  lockEventSelection,
  triggerLabel = "New Expense",
  onSaved,
}: {
  events?: EventOption[];
  defaultEventId?: string;
  lockEventSelection?: boolean;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() =>
    emptyExpenseForm(defaultEventId),
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  // The finance page passes events down from its own query; the sidebar quick
  // action has no such query, so load them on open instead.
  const [loadedEvents, setLoadedEvents] = useState<EventOption[]>([]);
  const eventOptions = events ?? loadedEvents;
  const [selectedPayer, setSelectedPayer] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  useEffect(() => {
    if (!open || events) return;
    listEventOptionsAction().then((result) => {
      if (!("error" in result)) setLoadedEvents(result.data);
    });
  }, [open, events]);

  function update<K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(emptyExpenseForm(defaultEventId));
      setSelectedPayer(null);
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createExpenseAction(
        packExpenseFormData(form, selectedPayer?.id ?? null),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Record a new expense.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Paid by (optional)</FieldLabel>
              <PersonPicker
                people={people}
                selected={selectedPayer}
                onSelect={setSelectedPayer}
                onPersonCreated={handlePersonCreated}
                placeholder="Search if someone personally fronted this..."
              />
            </Field>

            <ExpenseFormFields
              form={form}
              update={update}
              events={eventOptions}
              lockEventSelection={lockEventSelection}
              idPrefix="new-expense"
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
                "Add expense"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
