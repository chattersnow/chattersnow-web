"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react";
import { deleteDonationAction, updateDonationAction } from "./actions";
import {
  DonationFormFields,
  packDonationFormData,
  type DonationFormState,
} from "./donation-form-fields";
import {
  donorLabel,
  formatAmount,
  formatDonationDate,
  paymentMethodLabel,
  type EventOption,
  type MonetaryDonationRow,
} from "./donations-shared";
import type { PersonListItem } from "../../people/actions";
import type { PickedPerson } from "../../people/person-picker";
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
import { Field, FieldGroup } from "@/components/ui/field";
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
import { toast } from "@/components/ui/toast";

function pickedDonorFor(
  donation: MonetaryDonationRow,
  people: PersonListItem[],
): PickedPerson | null {
  if (!donation.donor_id) return null;
  const person = people.find((entry) => entry.id === donation.donor_id);
  return (
    person ?? {
      id: donation.donor_id,
      name: donation.people?.name ?? null,
      email: null,
      phone: null,
    }
  );
}

function formStateFor(
  donation: MonetaryDonationRow,
  people: PersonListItem[],
): DonationFormState {
  return {
    donor: pickedDonorFor(donation, people),
    eventId: donation.event_id ?? "",
    method: donation.method,
    receivedDate: donation.received_date,
    amount: String(donation.amount),
    notes: donation.notes ?? "",
  };
}

function isDirty(
  form: DonationFormState,
  donation: MonetaryDonationRow,
  people: PersonListItem[],
) {
  const baseline = formStateFor(donation, people);
  return (Object.keys(baseline) as (keyof DonationFormState)[]).some((key) =>
    key === "donor"
      ? (form.donor?.id ?? null) !== (baseline.donor?.id ?? null)
      : form[key] !== baseline[key],
  );
}

export function EditDonationModal({
  donation,
  events,
  people,
}: {
  donation: MonetaryDonationRow;
  events: EventOption[];
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<DonationFormState>(() =>
    formStateFor(donation, people),
  );
  const [peopleOptions, setPeopleOptions] = useState<PersonListItem[]>(people);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const formId = `edit-donation-form-${donation.id}`;
  const dirty = isDirty(form, donation, people);

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
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(donation, people));
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
    setForm(formStateFor(donation, people));
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
      const result = await updateDonationAction(
        donation.id,
        packDonationFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Donation deleted.");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDonationAction(donation.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDeleteDialogOpen(false);
      setOpen(false);
      toast.success("Donation deleted.");
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
                    aria-label="View donation"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View donation</TooltipContent>
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
                {mode === "edit" ? "Edit donation" : "Donation"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update the details for this donation."
                  : "View this donation's details."}
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
                      aria-label="Edit donation"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit donation</TooltipContent>
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
                <ReadOnlyField label="Donor" htmlFor="edit-donation-donor">
                  {donorLabel(donation)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Payment method"
                  htmlFor="edit-donation-method"
                >
                  {paymentMethodLabel(donation.method)}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="edit-donation-event">
                  {donation.events?.name ?? "No event"}
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField
                    label="Date"
                    htmlFor="edit-donation-receivedDate"
                  >
                    {formatDonationDate(donation.received_date)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Amount" htmlFor="edit-donation-amount">
                    {formatAmount(donation.amount)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField label="Notes" htmlFor="edit-donation-notes">
                  {donation.notes || "—"}
                </ReadOnlyField>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
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
                  <DonationFormFields
                    form={form}
                    update={update}
                    events={events}
                    people={peopleOptions}
                    onPersonCreated={handlePersonCreated}
                    idPrefix="edit-donation"
                  />

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

          {mode === "view" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 /> Delete
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
              You have unsaved changes to this donation. Leaving now will
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this donation?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
