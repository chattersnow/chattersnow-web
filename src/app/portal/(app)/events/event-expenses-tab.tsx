"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getExpenseApprovalContextAction,
  listEventExpensesAction,
} from "../finance/expenses/actions";
import { EditExpenseModal } from "../finance/expenses/edit-expense-modal";
import { ExpenseStatusBadge } from "../finance/expenses/expense-badges";
import {
  formatAmount,
  type EventOption,
  type ExpenseApprovalContext,
  type ExpenseRow,
  type ExpenseStatus,
} from "../finance/expenses/expenses-shared";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

const EMPTY_APPROVAL_CONTEXT: ExpenseApprovalContext = {
  userId: null,
  canApprove: false,
  canSelfApprove: false,
  canMarkPaid: false,
  threshold: null,
};

/**
 * Where each status sits in the approval workflow, so sorting by status walks
 * an expense's life rather than the alphabet -- which would open on
 * "Approved, Paid, Rejected, Submitted".
 */
const STATUS_ORDER: readonly ExpenseStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

export function EventExpensesTab({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
  mode: "view" | "edit";
}) {
  const {
    data: expenses,
    loadError,
    refresh,
  } = useTabData<ExpenseRow[]>(
    () => listEventExpensesAction(eventId),
    [eventId],
  );
  const [approvalContext, setApprovalContext] =
    useState<ExpenseApprovalContext>(EMPTY_APPROVAL_CONTEXT);

  const eventOptions: EventOption[] = useMemo(
    () => [{ id: eventId, name: eventName }],
    [eventId, eventName],
  );

  useEffect(() => {
    getExpenseApprovalContextAction().then(setApprovalContext);
  }, [eventId]);

  useRegisterTabRefresh<TabValue>("expenses", refresh);

  const columns = useMemo<PortalDataTableColumn<ExpenseRow>[]>(
    () => [
      {
        key: "description",
        label: "Description",
        sortValue: (expense) => expense.description,
        cellClassName: "whitespace-normal",
        render: (expense) => expense.description,
      },
      {
        key: "expense_date",
        label: "Date",
        sortValue: (expense) => expense.expense_date,
        cellClassName: "app-muted",
        render: (expense) => formatCalendarDate(expense.expense_date),
      },
      {
        key: "amount",
        // Numeric, because amounts arrive from Postgres as strings and would
        // otherwise sort "100" before "9". Currencies are not converted, so a
        // mixed-currency list sorts on the figures as written.
        label: "Amount",
        sortValue: (expense) => Number(expense.amount),
        render: (expense) => formatAmount(expense.amount, expense.currency),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (expense) => STATUS_ORDER.indexOf(expense.status),
        render: (expense) => <ExpenseStatusBadge status={expense.status} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (expense) => (
          <EditExpenseModal
            expense={expense}
            events={eventOptions}
            lockEventSelection
            approvalContext={approvalContext}
            onSaved={refresh}
          />
        ),
      },
    ],
    [eventOptions, approvalContext, refresh],
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {expenses === undefined ? (
        <TabLoadingSkeleton />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses recorded for this event yet"
          description="Add the first one with New Expense above."
        />
      ) : (
        <PortalDataTable
          columns={columns}
          rows={expenses}
          getRowKey={(expense) => expense.id}
          // listEventExpensesAction returns newest first.
          defaultSort={{ key: "expense_date", dir: "desc" }}
          emptyMessage="No expenses to show."
          // The tab is already inside its own card on the phase grid.
          shell="bare"
        />
      )}
    </div>
  );
}
