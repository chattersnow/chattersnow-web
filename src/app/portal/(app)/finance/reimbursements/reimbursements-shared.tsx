import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";

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
};

export type EventOption = { id: string; name: string };

export const CURRENCIES = [{ value: "USD", label: "USD" }];

export const REIMBURSEMENT_COLUMNS =
  "id, person_id, event_id, description, amount, currency, receipt_url, notes, people(name, email), events(name), status, submitted_by, approved_by, approved_at, rejected_at, rejection_reason, paid_by, paid_at, created_at";

/** Below the threshold, `finance` may self-approve its own submission. */
export function isSelfApprovalEligible(
  amount: number | string,
  threshold: number,
): boolean {
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numericAmount) || !Number.isFinite(threshold))
    return false;
  return numericAmount < threshold;
}

export type ReimbursementApprovalContext = {
  userId: string | null;
  canApprove: boolean;
  canSelfApprove: boolean;
  canMarkPaid: boolean;
  threshold: number | null;
};

export async function getReimbursementApprovalContext(
  supabase: SupabaseClient,
): Promise<ReimbursementApprovalContext> {
  const [{ data: userData }, permissions, { data: settingRow }] =
    await Promise.all([
      supabase.auth.getUser(),
      getCurrentUserPermissions(supabase),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "finance.reimbursement_approval_threshold")
        .maybeSingle(),
    ]);

  const thresholdValue = settingRow?.value;
  const threshold =
    typeof thresholdValue === "number"
      ? thresholdValue
      : Number(thresholdValue ?? NaN);

  return {
    userId: userData.user?.id ?? null,
    canApprove: hasPermission(permissions, "reimbursement_approvals", "manage"),
    canSelfApprove: hasPermission(
      permissions,
      "reimbursement_self_approval",
      "manage",
    ),
    canMarkPaid: hasPermission(permissions, "reimbursements", "manage"),
    threshold: Number.isFinite(threshold) ? threshold : null,
  };
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
  const isSubmitter =
    approvalContext.userId !== null &&
    approvalContext.userId === reimbursement.submitted_by;
  const thresholdLabel =
    approvalContext.threshold !== null
      ? formatAmount(approvalContext.threshold, reimbursement.currency)
      : null;

  if (reimbursement.status === "submitted") {
    if (isSubmitter) {
      if (approvalContext.canSelfApprove) {
        if (
          thresholdLabel !== null &&
          isSelfApprovalEligible(
            reimbursement.amount,
            approvalContext.threshold!,
          )
        ) {
          return `Below the ${thresholdLabel} approval threshold — you can self-approve this.`;
        }
        return thresholdLabel !== null
          ? `At or above the ${thresholdLabel} approval threshold — needs approval from an admin or board member.`
          : "Needs approval from an admin or board member.";
      }
      return "Awaiting approval from an admin or board member.";
    }
    return approvalContext.canApprove
      ? "Awaiting approval — you can approve or reject this."
      : "Awaiting approval from an admin or board member.";
  }

  if (reimbursement.status === "approved") {
    return approvalContext.canMarkPaid
      ? "Approved — mark it as paid once payment has been sent."
      : "Approved — awaiting payment.";
  }

  if (reimbursement.status === "rejected") {
    return "Rejected. See the reason below.";
  }

  return "Paid. This reimbursement is complete.";
}

export function formatAmount(amount: number | string, currency: string) {
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatReimbursementDate(value: string) {
  return dateFormatter.format(new Date(value));
}
