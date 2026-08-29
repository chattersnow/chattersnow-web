"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Check, Eye, Pencil, X } from "lucide-react";
import {
  approveExpenseAction,
  markExpensePaidAction,
  rejectExpenseAction,
  updateExpenseAction,
} from "./actions";
import { ExpenseStatusBadge } from "./expense-badges";
import {
  ExpenseFormFields,
  packExpenseFormData,
  type ExpenseFormState,
} from "./expense-form-fields";
import {
  formatAmount,
  formatExpenseDate,
  getExpenseNextStepMessage,
  isSelfApprovalEligible,
  type EventOption,
  type ExpenseApprovalContext,
  type ExpenseRow,
} from "./expenses-shared";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
  return (Object.keys(baseline) as (keyof ExpenseFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export function EditExpenseModal({
  expense,
  events,
  lockEventSelection,
  approvalContext,
  onSaved,
}: {
  expense: ExpenseRow;
  events: EventOption[];
  lockEventSelection?: boolean;
  approvalContext: ExpenseApprovalContext;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<ExpenseFormState>(() =>
    formStateFor(expense),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const formId = `edit-expense-form-${expense.id}`;
  const dirty = isDirty(form, expense);

  const isSubmitter =
    approvalContext.userId !== null &&
    approvalContext.userId === expense.submitted_by;
  const canSelfApproveThis =
    approvalContext.canSelfApprove &&
    isSubmitter &&
    approvalContext.threshold !== null &&
    isSelfApprovalEligible(expense.amount, approvalContext.threshold);
  const canApproveOrRejectThis = approvalContext.canApprove && !isSubmitter;
  const canApprove =
    expense.status === "submitted" &&
    (canApproveOrRejectThis || canSelfApproveThis);
  const canReject = expense.status === "submitted" && canApproveOrRejectThis;
  const canMarkPaid =
    expense.status === "approved" && approvalContext.canMarkPaid;
  const canEdit = expense.status === "submitted";

  function update<K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) {
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
      const result = await updateExpenseAction(
        expense.id,
        packExpenseFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
      onSaved?.();
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveExpenseAction(expense.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved?.();
    });
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await rejectExpenseAction(expense.id, rejectReason);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRejectDialogOpen(false);
      setRejectReason("");
      router.refresh();
      onSaved?.();
    });
  }

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      const result = await markExpensePaidAction(expense.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved?.();
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
                    aria-label="View expense"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View expense</TooltipContent>
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
                {mode === "edit" ? "Edit expense" : "Expense"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update the details for this expense."
                  : "View this expense's details."}
              </SheetDescription>
            </div>
            {mode === "view" && canEdit ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit expense"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit expense</TooltipContent>
              </Tooltip>
            ) : mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            ) : null}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <ExpenseStatusBadge status={expense.status} />
                    <span className="app-muted text-sm">
                      {getExpenseNextStepMessage(expense, approvalContext)}
                    </span>
                  </div>
                </Field>
                <ReadOnlyField
                  label="Description"
                  htmlFor="edit-expense-description"
                >
                  {expense.description}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="edit-expense-event">
                  {expense.events?.name ?? "No event"}
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField
                    label="Date"
                    htmlFor="edit-expense-expenseDate"
                  >
                    {formatExpenseDate(expense.expense_date)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Amount" htmlFor="edit-expense-amount">
                    {formatAmount(expense.amount, expense.currency)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField
                  label="Receipt link"
                  htmlFor="edit-expense-receiptUrl"
                >
                  {expense.receipt_url || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-expense-notes">
                  {expense.notes || "—"}
                </ReadOnlyField>

                {expense.status === "approved" && expense.approved_at && (
                  <ReadOnlyField
                    label="Approved"
                    htmlFor="edit-expense-approved"
                  >
                    {dateTimeFormatter.format(new Date(expense.approved_at))}
                  </ReadOnlyField>
                )}
                {expense.status === "rejected" && (
                  <>
                    {expense.rejected_at && (
                      <ReadOnlyField
                        label="Rejected"
                        htmlFor="edit-expense-rejected"
                      >
                        {dateTimeFormatter.format(
                          new Date(expense.rejected_at),
                        )}
                      </ReadOnlyField>
                    )}
                    <ReadOnlyField
                      label="Rejection reason"
                      htmlFor="edit-expense-rejection-reason"
                    >
                      {expense.rejection_reason || "—"}
                    </ReadOnlyField>
                  </>
                )}
                {expense.status === "paid" && expense.paid_at && (
                  <ReadOnlyField label="Paid" htmlFor="edit-expense-paid">
                    {dateTimeFormatter.format(new Date(expense.paid_at))}
                  </ReadOnlyField>
                )}

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

          {mode === "view" && (canApprove || canReject || canMarkPaid) && (
            <SheetFooter className="flex-row justify-end gap-2 border-t bg-muted/50">
              {canReject && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X /> Reject
                </Button>
              )}
              {canApprove && (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleApprove}
                >
                  <Check />{" "}
                  {isPending ? (
                    <>
                      <Spinner /> Approving...
                    </>
                  ) : (
                    "Approve"
                  )}
                </Button>
              )}
              {canMarkPaid && (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleMarkPaid}
                >
                  <Banknote />{" "}
                  {isPending ? (
                    <>
                      <Spinner /> Marking paid...
                    </>
                  ) : (
                    "Mark as paid"
                  )}
                </Button>
              )}
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
              You have unsaved changes to this expense. Leaving now will discard
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

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(next) => {
          setRejectDialogOpen(next);
          if (!next) setRejectReason("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
            <DialogDescription>
              Explain why this expense is being rejected.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReject}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reject-expense-reason">Reason</FieldLabel>
                <Textarea
                  id="reject-expense-reason"
                  required
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                />
              </Field>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Rejecting...
                  </>
                ) : (
                  "Reject expense"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
