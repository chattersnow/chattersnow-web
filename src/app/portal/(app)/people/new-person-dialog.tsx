"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPersonAction, type PersonListItem } from "./actions";
import {
  PersonFormFields,
  emptyPersonForm,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import { PersonPicker, type PickedPerson } from "./person-picker";
import type { RoleKey } from "./people-shared";
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

export function NewPersonDialog({
  people,
  defaultRole,
  triggerLabel = "New Person",
}: {
  people: PersonListItem[];
  defaultRole?: RoleKey;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [form, setForm] = useState<PersonFormState>(() =>
    emptyPersonForm(defaultRole),
  );
  const [contact, setContact] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const baseline = emptyPersonForm(defaultRole);
  const dirty = (Object.keys(baseline) as (keyof PersonFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setForm(emptyPersonForm(defaultRole));
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

    startTransition(async () => {
      const result = await createPersonAction(
        packPersonFormData(form),
        contact?.id ?? null,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Person added.");
      router.refresh();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this person"
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
          {triggerLabel}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>
              Add a donor, sponsor, or volunteer to the directory.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <PersonFormFields
                form={form}
                update={update}
                idPrefix="new-person"
              />

              <Field>
                <FieldLabel>
                  Primary contact person (for an organization)
                </FieldLabel>
                <PersonPicker
                  people={availablePeople}
                  selected={contact}
                  onSelect={setContact}
                  onPersonCreated={handlePersonCreated}
                  placeholder="Search by name or email..."
                />
              </Field>

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
                  "Add person"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
