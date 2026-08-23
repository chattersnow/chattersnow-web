"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EXPENSE_COLUMNS, getExpenseApprovalContext, type ExpenseApprovalContext, type ExpenseRow } from "./expenses-shared";
import { parseExpenseForm, parseRejectReason } from "./expense-form";
import { checkPermission, checkAnyPermission } from "@/lib/auth/permissions";

export type ExpenseActionResult = { error: string } | { success: true };

export async function createExpenseAction(formData: FormData): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record an expense." };
  }
  const permissionError = await checkPermission(supabase, "event_expenses", "manage");
  if (permissionError) return permissionError;

  const parsed = parseExpenseForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_expenses").insert(parsed.data);
  if (error) {
    return { error: "Could not save the expense. Please try again." };
  }

  revalidatePath("/portal/finance/expenses");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateExpenseAction(
  id: string,
  formData: FormData
): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update an expense." };
  }
  const permissionError = await checkPermission(supabase, "event_expenses", "manage");
  if (permissionError) return permissionError;

  const parsed = parseExpenseForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_expenses").update(parsed.data).eq("id", id);
  if (error) {
    return { error: "Could not update the expense. It may no longer be editable." };
  }

  revalidatePath("/portal/finance/expenses");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function listEventExpensesAction(
  eventId: string
): Promise<{ data: ExpenseRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "event_expenses", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_expenses")
    .select(EXPENSE_COLUMNS)
    .eq("event_id", eventId)
    .order("expense_date", { ascending: false });

  if (error) {
    return { error: "Could not load expenses for this event. Please try again." };
  }
  return { data: (data ?? []) as unknown as ExpenseRow[] };
}

export async function getExpenseApprovalContextAction(): Promise<ExpenseApprovalContext> {
  const supabase = await createSupabaseServerClient();
  return getExpenseApprovalContext(supabase);
}

function revalidateExpensePaths() {
  revalidatePath("/portal/finance/expenses");
  revalidatePath("/portal/events");
}

export async function approveExpenseAction(id: string): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "finance_approvals", level: "manage" },
    { resource: "finance_self_approval", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("approve_event_expense", { p_id: id });
  if (error) {
    return { error: error.message };
  }
  revalidateExpensePaths();
  return { success: true };
}

export async function rejectExpenseAction(id: string, reason: string): Promise<ExpenseActionResult> {
  const parsed = parseRejectReason(reason);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance_approvals", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("reject_event_expense", { p_id: id, p_reason: parsed.data });
  if (error) {
    return { error: error.message };
  }
  revalidateExpensePaths();
  return { success: true };
}

export async function markExpensePaidAction(id: string): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("mark_event_expense_paid", { p_id: id });
  if (error) {
    return { error: error.message };
  }
  revalidateExpensePaths();
  return { success: true };
}
