import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatAmount,
  getApprovalContext,
  getApprovalNextStepMessage,
  isSelfApprovalEligible,
  type ApprovalContext,
} from "@/lib/finance/approval-workflow";

export { formatAmount, isSelfApprovalEligible };

export type ReimbursementStatus =
  "submitted" | "approved" | "rejected" | "paid";

const REIMBURSEMENT_STATUSES: readonly ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

export function isReimbursementStatus(
  value: string | undefined,
): value is ReimbursementStatus {
  return (
    !!value && (REIMBURSEMENT_STATUSES as readonly string[]).includes(value)
  );
}

export type ReimbursementRow = {
  id: string;
  person_id: string;
  event_id: string | null;
  description: string;
  amount: number | string;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
  people: { name: string | null; email: string | null } | null;
  events: { name: string } | null;
  status: ReimbursementStatus;
  submitted_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  source_expense_id: string | null;
  source_expense: { id: string; description: string } | null;
};

export type EventOption = { id: string; name: string };

export const CURRENCIES = [{ value: "USD", label: "USD" }];

export const REIMBURSEMENT_COLUMNS =
  "id, person_id, event_id, description, amount, currency, receipt_url, notes, people(name, email), events(name), status, submitted_by, approved_by, approved_at, rejected_at, rejection_reason, paid_by, paid_at, created_at, source_expense_id, source_expense:event_expenses!source_expense_id(id, description)";

export type ReimbursementApprovalContext = ApprovalContext;

export async function getReimbursementApprovalContext(
  supabase: SupabaseClient,
): Promise<ReimbursementApprovalContext> {
  return getApprovalContext(
    supabase,
    "finance.reimbursement_approval_threshold",
    {
      approve: "reimbursement_approvals",
      selfApprove: "reimbursement_self_approval",
      markPaid: "reimbursements",
    },
  );
}

/**
 * Plain-language "what happens next" line for the reimbursement detail view,
 * so someone new to the workflow can see who acts next without having to
 * know the underlying rules.
 */
export function getReimbursementNextStepMessage(
  reimbursement: Pick<
    ReimbursementRow,
    "status" | "submitted_by" | "amount" | "currency"
  >,
  approvalContext: ReimbursementApprovalContext,
): string {
  return getApprovalNextStepMessage(
    reimbursement,
    approvalContext,
    "reimbursement",
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatReimbursementDate(value: string) {
  return dateFormatter.format(new Date(value));
}
