"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getReimbursementApprovalContext,
  type ReimbursementApprovalContext,
} from "./reimbursements-shared";
import {
  parseReimbursementForm,
  parseRejectReason,
} from "./reimbursement-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";

export type ReimbursementActionResult = { error: string } | { success: true };

function revalidateReimbursementPaths() {
  revalidatePath("/portal/finance/reimbursements");
}

export async function createReimbursementAction(
  formData: FormData,
): Promise<ReimbursementActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "reimbursements",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseReimbursementForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("reimbursements").insert(parsed.data);
  if (error) {
    return { error: "Could not save the reimbursement. Please try again." };
  }

  revalidateReimbursementPaths();
  return { success: true };
}

export async function updateReimbursementAction(
  id: string,
  formData: FormData,
): Promise<ReimbursementActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "reimbursements",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseReimbursementForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("reimbursements")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return {
      error:
        "Could not update the reimbursement. It may no longer be editable.",
    };
  }

  revalidateReimbursementPaths();
  return { success: true };
}

export async function getReimbursementApprovalContextAction(): Promise<ReimbursementApprovalContext> {
  const supabase = await createSupabaseServerClient();
  return getReimbursementApprovalContext(supabase);
}

/**
 * Creates a reimbursement from a personally-fronted expense (issue #525),
 * prefilling person/event/amount/description/receipt from the source
 * expense instead of requiring re-entry. Goes straight to 'submitted' --
 * reimbursements have no separate draft state, so that's the same place a
 * hand-filled New Reimbursement submission would land. Traceability back to
 * the expense is source_expense_id; the source expense row is left
 * untouched.
 */
export async function createReimbursementFromExpenseAction(
  expenseId: string,
): Promise<ReimbursementActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "reimbursements",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: expense, error: expenseError } = await supabase
    .from("event_expenses")
    .select(
      "id, event_id, description, amount, currency, receipt_url, paid_by_person_id",
    )
    .eq("id", expenseId)
    .single();
  if (expenseError || !expense) {
    return { error: "Could not find the source expense." };
  }
  if (!expense.paid_by_person_id) {
    return { error: "This expense isn't marked as personally paid." };
  }

  const { error } = await supabase.from("reimbursements").insert({
    person_id: expense.paid_by_person_id,
    event_id: expense.event_id,
    description: `Reimbursement for: ${expense.description}`,
    amount: expense.amount,
    currency: expense.currency,
    receipt_url: expense.receipt_url,
    source_expense_id: expense.id,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A reimbursement has already been created from this expense."
          : "Could not create the reimbursement. Please try again.",
    };
  }

  revalidateReimbursementPaths();
  revalidatePath("/portal/finance/expenses");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function approveReimbursementAction(
  id: string,
): Promise<ReimbursementActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "reimbursement_approvals", level: "manage" },
    { resource: "reimbursement_self_approval", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("approve_reimbursement", { p_id: id });
  if (error) {
    return { error: error.message };
  }
  revalidateReimbursementPaths();
  return { success: true };
}

export async function rejectReimbursementAction(
  id: string,
  reason: string,
): Promise<ReimbursementActionResult> {
  const parsed = parseRejectReason(reason);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "reimbursement_approvals",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("reject_reimbursement", {
    p_id: id,
    p_reason: parsed.data,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateReimbursementPaths();
  return { success: true };
}

export async function markReimbursementPaidAction(
  id: string,
): Promise<ReimbursementActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "reimbursements",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("mark_reimbursement_paid", {
    p_id: id,
  });
  if (error) {
    return { error: error.message };
  }
  revalidateReimbursementPaths();
  return { success: true };
}
