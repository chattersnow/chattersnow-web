"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateExpenseAction } from "./actions";
import { ExpenseFormFields, packExpenseFormData, type ExpenseFormState } from "./expense-form-fields";
import type { EventOption, ExpenseRow } from "./expenses-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
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
  const [form, setForm] = useState<ExpenseFormState>(() => formStateFor(expense));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(expense));
      setError(null);
    }
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
      setOpen(false);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit expense" />}
      >
        <Pencil />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-lg">
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <SheetClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
          >
            <ArrowLeft />
          </SheetClose>
          <div className="flex flex-col gap-0.5">
            <SheetTitle>Edit expense</SheetTitle>
            <SheetDescription>Update the details for this expense.</SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
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

          <SheetFooter className="flex-row justify-end border-t bg-muted/50">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
