"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updatePersonAction, type PersonListItem } from "./actions";
import {
  PersonFormFields,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import { PersonPicker, type PickedPerson } from "./person-picker";
import { rolesFor, type PersonRow } from "./people-shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";

function formStateFor(person: PersonRow): PersonFormState {
  return {
    name: person.name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    instagramHandle: person.instagram_handle ?? "",
    notes: person.notes ?? "",
    logoUrl: person.logo_url ?? "",
    website: person.website ?? "",
    roles: {
      is_donor: person.is_donor,
      is_sponsor: person.is_sponsor,
      is_volunteer: person.is_volunteer,
    },
  };
}

function isDirty(
  form: PersonFormState,
  contact: PickedPerson | null,
  person: PersonRow,
) {
  const baseline = formStateFor(person);
  return (
    form.name !== baseline.name ||
    form.email !== baseline.email ||
    form.phone !== baseline.phone ||
    form.instagramHandle !== baseline.instagramHandle ||
    form.notes !== baseline.notes ||
    form.logoUrl !== baseline.logoUrl ||
    form.website !== baseline.website ||
    form.roles.is_donor !== baseline.roles.is_donor ||
    form.roles.is_sponsor !== baseline.roles.is_sponsor ||
    form.roles.is_volunteer !== baseline.roles.is_volunteer ||
    (contact?.id ?? null) !== (person.primary_contact_person_id ?? null)
  );
}

export function EditPersonModal({
  person,
  people,
}: {
  person: PersonRow;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const selectablePeople = people.filter((p) => p.id !== person.id);
  const [availablePeople, setAvailablePeople] = useState(selectablePeople);
  const [form, setForm] = useState<PersonFormState>(() => formStateFor(person));
  const [contact, setContact] = useState<PickedPerson | null>(
    person.primary_contact,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-person-form-${person.id}`;
  const dirty = isDirty(form, contact, person);

  function update<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(created: PickedPerson) {
    setAvailablePeople((prev) => [...prev, { ...created, is_sponsor: false }]);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(selectablePeople);
      setForm(formStateFor(person));
      setContact(person.primary_contact);
      setError(null);
      setMode("view");
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(formStateFor(person));
    setContact(person.primary_contact);
    setError(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updatePersonAction(
        person.id,
        packPersonFormData(form),
        contact?.id ?? null,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="View person"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View person</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit" ? "Edit person" : "Person"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this person's contact details and roles."
                  : "View this person's contact details and roles."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit person"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit person</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Name" htmlFor="edit-person-name">
                  {person.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Email" htmlFor="edit-person-email">
                  {person.email || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Phone" htmlFor="edit-person-phone">
                  {person.phone || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Instagram"
                  htmlFor="edit-person-instagram"
                >
                  {person.instagram_handle
                    ? `@${person.instagram_handle}`
                    : "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Logo URL" htmlFor="edit-person-logo-url">
                  {person.logo_url || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Website" htmlFor="edit-person-website">
                  {person.website || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Roles" htmlFor="edit-person-roles">
                  {rolesFor(person).join(", ") || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Primary contact"
                  htmlFor="edit-person-primary-contact"
                >
                  {person.primary_contact?.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-person-notes">
                  {person.notes || "—"}
                </ReadOnlyField>
              </FieldGroup>

              <Link
                href={`/portal/people/${person.id}`}
                className="app-muted mt-4 inline-block text-sm underline underline-offset-2"
              >
                Open full profile →
              </Link>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <PersonFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-person"
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
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this person. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
