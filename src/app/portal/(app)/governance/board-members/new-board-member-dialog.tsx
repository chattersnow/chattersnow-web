"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoardMemberAction } from "./actions";
import {
  BoardMemberFormFields,
  emptyBoardMemberForm,
  packBoardMemberFormData,
  type BoardMemberFormState,
} from "./board-member-form-fields";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function NewBoardMemberDialog({ people }: { people: PersonListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<BoardMemberFormState>(() =>
    emptyBoardMemberForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof BoardMemberFormState>(
    key: K,
    value: BoardMemberFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedPerson(null);
      setForm(emptyBoardMemberForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedPerson) {
      setError("Select or create a person to link.");
      return;
    }

    startTransition(async () => {
      const result = await createBoardMemberAction(
        selectedPerson.id,
        packBoardMemberFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Board member added.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        Add board member
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add board member</DialogTitle>
          <DialogDescription>Link a person to a board term.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Person</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={selectedPerson}
                onSelect={setSelectedPerson}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            <BoardMemberFormFields
              form={form}
              update={update}
              idPrefix="new-board-member"
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
                "Add board member"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
