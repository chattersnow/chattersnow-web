"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  updateAnnualRequirementAction,
  type AnnualRequirement,
} from "./annual-requirements-actions";
import {
  AnnualRequirementFormFields,
  packAnnualRequirementFormData,
  type AnnualRequirementFormState,
} from "./annual-requirement-form-fields";
import { RequirementStatusBadge } from "./annual-requirements-badges";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
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
import { FieldGroup } from "@/components/ui/field";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

function formStateFor(
  requirement: AnnualRequirement,
): AnnualRequirementFormState {
  return {
    name: requirement.name,
    dueDate: requirement.due_date,
    status: requirement.status,
    externalLink: requirement.external_link ?? "",
    bodyText: requirement.body_text ?? "",
  };
}

function isDirty(
  form: AnnualRequirementFormState,
  responsible: PickedPerson | null,
  requirement: AnnualRequirement,
) {
  const baseline = formStateFor(requirement);
  return (
    form.name !== baseline.name ||
    form.dueDate !== baseline.dueDate ||
    form.status !== baseline.status ||
    form.externalLink !== baseline.externalLink ||
    form.bodyText !== baseline.bodyText ||
    (responsible?.id ?? null) !== (requirement.responsible?.id ?? null)
  );
}

export function EditRequirementModal({
  requirement,
  people,
}: {
  requirement: AnnualRequirement;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedResponsible, setSelectedResponsible] =
    useState<PickedPerson | null>(requirement.responsible);
  const [form, setForm] = useState<AnnualRequirementFormState>(() =>
    formStateFor(requirement),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-requirement-form-${requirement.id}`;
  const dirty = isDirty(form, selectedResponsible, requirement);

  function update<K extends keyof AnnualRequirementFormState>(
    key: K,
    value: AnnualRequirementFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function resetToBaseline() {
    setForm(formStateFor(requirement));
    setSelectedResponsible(requirement.responsible);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      resetToBaseline();
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
    resetToBaseline();
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
      const result = await updateAnnualRequirementAction(
        requirement.id,
        selectedResponsible?.id ?? null,
        packAnnualRequirementFormData(form),
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
                    aria-label="View requirement"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View requirement</TooltipContent>
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
                {mode === "edit" ? "Edit requirement" : "Annual requirement"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this requirement's details."
                  : "View this requirement's details."}
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
                      aria-label="Edit requirement"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit requirement</TooltipContent>
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
                <ReadOnlyField label="Name" htmlFor="edit-requirement-name">
                  {requirement.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Due date"
                  htmlFor="edit-requirement-due-date"
                >
                  {formatDate(requirement.due_date)}
                </ReadOnlyField>
                <ReadOnlyField label="Status" htmlFor="edit-requirement-status">
                  <RequirementStatusBadge status={requirement.status} />
                </ReadOnlyField>
                <ReadOnlyField
                  label="Completed at"
                  htmlFor="edit-requirement-completed-at"
                >
                  {formatDateTime(requirement.completed_at)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Responsible person"
                  htmlFor="edit-requirement-responsible"
                >
                  {requirement.responsible?.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="External link"
                  htmlFor="edit-requirement-external-link"
                >
                  {requirement.external_link ? (
                    <a
                      href={requirement.external_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--purple-deep)] underline"
                    >
                      {requirement.external_link}
                    </a>
                  ) : (
                    "—"
                  )}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-requirement-notes">
                  <span className="whitespace-pre-wrap">
                    {requirement.body_text || "—"}
                  </span>
                </ReadOnlyField>
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <AnnualRequirementFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-requirement"
                  />

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      Responsible person
                    </span>
                    <PersonPicker
                      people={availablePeople}
                      selected={selectedResponsible}
                      onSelect={setSelectedResponsible}
                      onPersonCreated={handlePersonCreated}
                    />
                  </div>

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
              You have unsaved changes to this requirement. Leaving now will
              discard them.
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
