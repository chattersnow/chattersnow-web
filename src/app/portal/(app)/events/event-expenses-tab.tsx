"use client";

import { useEffect, useState } from "react";
import {
  getExpenseApprovalContextAction,
  listEventExpensesAction,
} from "../finance/expenses/actions";
import { EditExpenseModal } from "../finance/expenses/edit-expense-modal";
import { ExpenseStatusBadge } from "../finance/expenses/expense-badges";
import { NewExpenseDialog } from "../finance/expenses/new-expense-dialog";
import {
  formatAmount,
  formatExpenseDate,
  type EventOption,
  type ExpenseApprovalContext,
  type ExpenseRow,
} from "../finance/expenses/expenses-shared";
import { useTabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const EMPTY_APPROVAL_CONTEXT: ExpenseApprovalContext = {
  userId: null,
  canApprove: false,
  canSelfApprove: false,
  canMarkPaid: false,
  threshold: null,
};

export function EventExpensesTab({
  eventId,
  eventName,
  active,
  mode,
}: {
  eventId: string;
  eventName: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const {
    data: expenses,
    loadError,
    refresh,
  } = useTabData<ExpenseRow[]>(() => listEventExpensesAction(eventId), active, [
    eventId,
  ]);
  const [approvalContext, setApprovalContext] =
    useState<ExpenseApprovalContext>(EMPTY_APPROVAL_CONTEXT);

  const eventOptions: EventOption[] = [{ id: eventId, name: eventName }];

  useEffect(() => {
    if (!active) return;
    getExpenseApprovalContextAction().then(setApprovalContext);
  }, [active, eventId]);

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {mode === "edit" && (
        <NewExpenseDialog
          events={eventOptions}
          defaultEventId={eventId}
          lockEventSelection
          triggerLabel="New Expense"
          onSaved={refresh}
        />
      )}

      {expenses === undefined ? (
        <TabLoadingSkeleton />
      ) : expenses.length === 0 ? (
        <p className="app-muted text-sm">
          No expenses recorded for this event yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="whitespace-normal">
                  {expense.description}
                </TableCell>
                <TableCell className="app-muted">
                  {formatExpenseDate(expense.expense_date)}
                </TableCell>
                <TableCell>
                  {formatAmount(expense.amount, expense.currency)}
                </TableCell>
                <TableCell>
                  <ExpenseStatusBadge status={expense.status} />
                </TableCell>
                <TableCell>
                  <EditExpenseModal
                    expense={expense}
                    events={eventOptions}
                    lockEventSelection
                    approvalContext={approvalContext}
                    onSaved={refresh}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
