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
