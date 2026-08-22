"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExpenseRow } from "./expenses-shared";
import { parseExpenseForm } from "./expense-form";

export type ExpenseActionResult = { error: string } | { success: true };

export async function createExpenseAction(formData: FormData): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record an expense." };
  }

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

  const parsed = parseExpenseForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_expenses").update(parsed.data).eq("id", id);
  if (error) {
    return { error: "Could not update the expense. Please try again." };
  }

  revalidatePath("/portal/finance/expenses");
  revalidatePath("/portal/events");
  return { success: true };
}

export async function listEventExpensesAction(
  eventId: string
): Promise<{ data: ExpenseRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_expenses")
    .select(
      "id, event_id, description, expense_date, amount, currency, receipt_url, notes, events(name)"
    )
    .eq("event_id", eventId)
    .order("expense_date", { ascending: false });

  if (error) {
    return { error: "Could not load expenses for this event. Please try again." };
  }
  return { data: (data ?? []) as unknown as ExpenseRow[] };
}
