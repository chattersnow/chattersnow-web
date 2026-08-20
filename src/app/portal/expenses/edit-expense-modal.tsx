"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateExpenseAction } from "./actions";
import { ExpenseFormFields, packExpenseFormData, type ExpenseFormState } from "./expense-form-fields";
import type { EventOption, ExpenseRow } from "./expenses-shared";
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
import { FieldGroup } from "@/components/ui/field";

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit expense" />}
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Update the details for this expense.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
