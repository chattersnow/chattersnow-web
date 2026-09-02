import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";

export type ApprovalStatus = "submitted" | "approved" | "rejected" | "paid";

export type ApprovalContext = {
  userId: string | null;
  canApprove: boolean;
  canSelfApprove: boolean;
  canMarkPaid: boolean;
  threshold: number | null;
};

/** Permission resources that gate each stage of an approval workflow. */
export type ApprovalPermissionResources = {
  approve: string;
  selfApprove: string;
  markPaid: string;
};

/** Below the threshold, the submitter may self-approve their own submission. */
export function isSelfApprovalEligible(
  amount: number | string,
  threshold: number,
): boolean {
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numericAmount) || !Number.isFinite(threshold))
    return false;
  return numericAmount < threshold;
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

export async function getApprovalContext(
  supabase: SupabaseClient,
  thresholdSettingKey: string,
  resources: ApprovalPermissionResources,
): Promise<ApprovalContext> {
  const [{ data: userData }, permissions, { data: settingRow }] =
    await Promise.all([
      supabase.auth.getUser(),
      getCurrentUserPermissions(supabase),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", thresholdSettingKey)
        .maybeSingle(),
    ]);

  const thresholdValue = settingRow?.value;
  const threshold =
    typeof thresholdValue === "number"
      ? thresholdValue
      : Number(thresholdValue ?? NaN);

  return {
    userId: userData.user?.id ?? null,
    canApprove: hasPermission(permissions, resources.approve, "manage"),
    canSelfApprove: hasPermission(permissions, resources.selfApprove, "manage"),
    canMarkPaid: hasPermission(permissions, resources.markPaid, "manage"),
    threshold: Number.isFinite(threshold) ? threshold : null,
  };
}

export type ApprovableEntity = {
  status: ApprovalStatus;
  submitted_by: string;
  amount: number | string;
  currency: string;
};

/**
 * Plain-language "what happens next" line for an approval-workflow detail
 * view, so someone new to the workflow can see who acts next without having
 * to know the underlying rules. `entityLabel` is the human-readable noun
 * ("expense", "reimbursement") used in the terminal "paid" message.
 */
export function getApprovalNextStepMessage(
  entity: ApprovableEntity,
  approvalContext: ApprovalContext,
  entityLabel: string,
): string {
  const isSubmitter =
    approvalContext.userId !== null &&
    approvalContext.userId === entity.submitted_by;
  const thresholdLabel =
    approvalContext.threshold !== null
      ? formatAmount(approvalContext.threshold, entity.currency)
      : null;

  if (entity.status === "submitted") {
    if (isSubmitter) {
      if (approvalContext.canSelfApprove) {
        if (
          thresholdLabel !== null &&
          isSelfApprovalEligible(entity.amount, approvalContext.threshold!)
        ) {
          return `Below the ${thresholdLabel} approval threshold — you can self-approve this.`;
        }
        return thresholdLabel !== null
          ? `At or above the ${thresholdLabel} approval threshold — you submitted this, so it needs approval from another admin or board member.`
          : "You submitted this, so it needs approval from another admin or board member.";
      }
      return "You submitted this, so it needs approval from another admin or board member.";
    }
    return approvalContext.canApprove
      ? "Awaiting approval — you can approve or reject this."
      : "Awaiting approval from an admin or board member.";
  }

  if (entity.status === "approved") {
    return approvalContext.canMarkPaid
      ? "Approved — mark it as paid once payment has been sent."
      : "Approved — awaiting payment.";
  }

  if (entity.status === "rejected") {
    return "Rejected. See the reason below.";
  }

  return `Paid. This ${entityLabel} is complete.`;
}
