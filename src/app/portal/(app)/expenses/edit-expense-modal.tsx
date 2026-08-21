"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateExpenseAction } from "./actions";
import { ExpenseFormFields, packExpenseFormData, type ExpenseFormState } from "./expense-form-fields";
import { formatAmount, formatExpenseDate, type EventOption, type ExpenseRow } from "./expenses-shared";
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

function formStateFor(expense: ExpenseRow): ExpenseFormState {
  return {
    description: expense.description,
    eventId: expense.event_id ?? "",
    expenseDate: expense.expense_date,
    amount: String(expense.amount),
    currency: expense.currency,
    receiptUrl: expense.receipt_url ?? "",
    notes: expense.notes ?? "",
  };
}

function isDirty(form: ExpenseFormState, expense: ExpenseRow) {
  const baseline = formStateFor(expense);
  return (Object.keys(baseline) as (keyof ExpenseFormState)[]).some((key) => form[key] !== baseline[key]);
}

export function EditExpenseModal({
  expense,
  events,
  lockEventSelection,
  onSaved,
}: {
  expense: ExpenseRow;
  events: EventOption[];
  lockEventSelection?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<ExpenseFormState>(() => formStateFor(expense));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(null);
  const formId = `edit-expense-form-${expense.id}`;
  const dirty = isDirty(form, expense);

  function update<K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(expense));
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
    setForm(formStateFor(expense));
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
      const result = await updateExpenseAction(expense.id, packExpenseFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label="View expense" />}
        >
          <Eye />
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-lg">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose
              render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
            >
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{mode === "edit" ? "Edit expense" : "Expense"}</SheetTitle>
              <SheetDescription>
                {mode === "edit" ? "Update the details for this expense." : "View this expense's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => setMode("edit")}>
                <Pencil />
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={requestExitEditMode}>
                View
              </Button>
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Description" htmlFor="edit-expense-description">
                  {expense.description}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="edit-expense-event">
                  {expense.events?.name ?? "No event"}
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField label="Date" htmlFor="edit-expense-expenseDate">
                    {formatExpenseDate(expense.expense_date)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Amount" htmlFor="edit-expense-amount">
                    {formatAmount(expense.amount, expense.currency)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField label="Receipt link" htmlFor="edit-expense-receiptUrl">
                  {expense.receipt_url || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-expense-notes">
                  {expense.notes || "—"}
                </ReadOnlyField>
              </FieldGroup>
            </div>
          ) : (
            <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <ExpenseFormFields
                    form={form}
                    update={update}
                    events={events}
                    lockEventSelection={lockEventSelection}
                    idPrefix="edit-expense"
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
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardTarget !== null} onOpenChange={(next) => !next && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this expense. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
