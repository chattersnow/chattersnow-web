import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatAmount,
  getApprovalContext,
  getApprovalNextStepMessage,
  isSelfApprovalEligible,
  type ApprovalContext,
} from "@/lib/finance/approval-workflow";
import type { ReimbursementStatus } from "../reimbursements/reimbursements-shared";

export { formatAmount, isSelfApprovalEligible };

export type ExpenseStatus = "submitted" | "approved" | "rejected" | "paid";

const EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

export function isExpenseStatus(
  value: string | undefined,
): value is ExpenseStatus {
  return !!value && (EXPENSE_STATUSES as readonly string[]).includes(value);
}

export type ExpenseRow = {
  id: string;
  event_id: string | null;
  description: string;
  expense_date: string;
  amount: number | string;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
  events: { name: string } | null;
  status: ExpenseStatus;
  submitted_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  paid_by: string | null;
  paid_at: string | null;
  paid_by_person_id: string | null;
  paid_by_person: { name: string | null; email: string | null } | null;
  source_reimbursements: { id: string; status: ReimbursementStatus }[];
};

export type EventOption = { id: string; name: string };

export type ExpenseActor = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

export const CURRENCIES = [{ value: "USD", label: "USD" }];

export const EXPENSE_COLUMNS =
  "id, event_id, description, expense_date, amount, currency, receipt_url, notes, events(name), status, submitted_by, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, paid_by, paid_at, paid_by_person_id, paid_by_person:people!paid_by_person_id(name, email), source_reimbursements:reimbursements!source_expense_id(id, status)";

export type ExpenseApprovalContext = ApprovalContext;

export async function getExpenseApprovalContext(
  supabase: SupabaseClient,
): Promise<ExpenseApprovalContext> {
  return getApprovalContext(supabase, "finance.expense_approval_threshold", {
    approve: "finance_approvals",
    selfApprove: "finance_self_approval",
    markPaid: "finance",
  });
}

/**
 * Plain-language "what happens next" line for the expense detail view, so
 * someone new to the workflow can see who acts next without having to know
 * the underlying rules.
 */
export function getExpenseNextStepMessage(
  expense: Pick<ExpenseRow, "status" | "submitted_by" | "amount" | "currency">,
  approvalContext: ExpenseApprovalContext,
): string {
  return getApprovalNextStepMessage(expense, approvalContext, "expense");
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatExpenseDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}
