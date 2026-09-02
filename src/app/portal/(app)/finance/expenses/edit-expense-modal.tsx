"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Check,
  Eye,
  HandCoins,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  approveExpenseAction,
  deleteExpenseAction,
  listExpenseActorsAction,
  markExpensePaidAction,
  rejectExpenseAction,
  updateExpenseAction,
} from "./actions";
import { createReimbursementFromExpenseAction } from "../reimbursements/actions";
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
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
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

function payerFor(expense: ExpenseRow): PickedPerson | null {
  if (!expense.paid_by_person_id) return null;
  return {
    id: expense.paid_by_person_id,
    name: expense.paid_by_person?.name ?? null,
    email: expense.paid_by_person?.email ?? null,
    phone: null,
  };
}

function isDirty(
  form: ExpenseFormState,
  payer: PickedPerson | null,
  expense: ExpenseRow,
) {
  const baseline = formStateFor(expense);
  const formChanged = (
    Object.keys(baseline) as (keyof ExpenseFormState)[]
  ).some((key) => form[key] !== baseline[key]);
  return formChanged || (payer?.id ?? null) !== expense.paid_by_person_id;
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
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<PickedPerson | null>(() =>
    payerFor(expense),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createReimbursementOpen, setCreateReimbursementOpen] = useState(false);
  const [actorNameById, setActorNameById] = useState<Map<string, string>>(
    new Map(),
  );
  const formId = `edit-expense-form-${expense.id}`;
  const dirty = isDirty(form, selectedPayer, expense);

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ids = Array.from(
      new Set(
        [
          expense.submitted_by,
          expense.approved_by,
          expense.rejected_by,
          expense.paid_by,
        ].filter((id): id is string => !!id),
      ),
    );
    if (ids.length === 0) return;
    listExpenseActorsAction(ids).then((result) => {
      if ("data" in result) {
        setActorNameById(
          new Map(
            result.data.map((actor) => [
              actor.user_id,
              actor.full_name || actor.email || actor.user_id,
            ]),
          ),
        );
      }
    });
  }, [
    open,
    expense.submitted_by,
    expense.approved_by,
    expense.rejected_by,
    expense.paid_by,
  ]);

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
  const canDelete =
    expense.status === "submitted" || expense.status === "rejected";
  const hasLinkedReimbursement = expense.source_reimbursements.length > 0;
  const canCreateReimbursement =
    !!expense.paid_by_person_id &&
    !hasLinkedReimbursement &&
    expense.status !== "rejected";

  function update<K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function resetToBaseline() {
    setForm(formStateFor(expense));
    setSelectedPayer(payerFor(expense));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
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
      const result = await updateExpenseAction(
        expense.id,
        packExpenseFormData(form, selectedPayer?.id ?? null),
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

  function handleCreateReimbursement() {
    setError(null);
    startTransition(async () => {
      const result = await createReimbursementFromExpenseAction(expense.id);
      if ("error" in result) {
        setCreateReimbursementOpen(false);
        setError(result.error);
        return;
      }
      setCreateReimbursementOpen(false);
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

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id);
      if ("error" in result) {
        setDeleteDialogOpen(false);
        setError(result.error);
        return;
      }
      setDeleteDialogOpen(false);
      setOpen(false);
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
            {mode === "view" && (canEdit || canDelete) ? (
              <div className="flex items-center gap-1">
                {canEdit && (
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
                )}
                {canDelete && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete expense"
                          onClick={() => setDeleteDialogOpen(true)}
                        />
                      }
                    >
                      <Trash2 />
                    </TooltipTrigger>
                    <TooltipContent>Delete expense</TooltipContent>
                  </Tooltip>
                )}
              </div>
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
                  label="Submitted by"
                  htmlFor="edit-expense-submitted-by"
                >
                  {actorNameById.get(expense.submitted_by) ?? "Loading..."}
                </ReadOnlyField>
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
                <ReadOnlyField label="Paid by" htmlFor="edit-expense-paid-by">
                  {expense.paid_by_person
                    ? (expense.paid_by_person.name ??
                      expense.paid_by_person.email ??
                      "—")
                    : "Chatter Snow (not personally fronted)"}
                </ReadOnlyField>
                {hasLinkedReimbursement && (
                  <ReadOnlyField
                    label="Reimbursement"
                    htmlFor="edit-expense-reimbursement"
                  >
                    Created —{" "}
                    <span className="capitalize">
                      {expense.source_reimbursements[0]?.status}
                    </span>
                  </ReadOnlyField>
                )}

                {expense.status === "approved" && expense.approved_at && (
                  <>
                    <ReadOnlyField
                      label="Approved"
                      htmlFor="edit-expense-approved"
                    >
                      {dateTimeFormatter.format(new Date(expense.approved_at))}
                    </ReadOnlyField>
                    {expense.approved_by && (
                      <ReadOnlyField
                        label="Approved by"
                        htmlFor="edit-expense-approved-by"
                      >
                        {actorNameById.get(expense.approved_by) ?? "Loading..."}
                      </ReadOnlyField>
                    )}
                  </>
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
                    {expense.rejected_by && (
                      <ReadOnlyField
                        label="Rejected by"
                        htmlFor="edit-expense-rejected-by"
                      >
                        {actorNameById.get(expense.rejected_by) ?? "Loading..."}
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

          {mode === "view" &&
            (canApprove ||
              canReject ||
              canMarkPaid ||
              canCreateReimbursement) && (
              <SheetFooter className="flex-row justify-end gap-2 border-t bg-muted/50">
                {canCreateReimbursement && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => setCreateReimbursementOpen(true)}
                  >
                    <HandCoins /> Create reimbursement
                  </Button>
                )}
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

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(next) => !next && setDeleteDialogOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </AlertDialogCancel>
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
                "Delete expense"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={createReimbursementOpen}
        onOpenChange={(next) => !next && setCreateReimbursementOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a reimbursement?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a submitted reimbursement request for{" "}
              {expense.paid_by_person?.name ??
                expense.paid_by_person?.email ??
                "this person"}{" "}
              for {formatAmount(expense.amount, expense.currency)}, prefilled
              from this expense. The expense itself stays as-is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setCreateReimbursementOpen(false)}
              disabled={isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateReimbursement}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Creating...
                </>
              ) : (
                "Create reimbursement"
              )}
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
