"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExpenseRow } from "./expenses-shared";

export type ExpenseActionResult = { error: string } | { success: true };

type ExpenseValues = {
  description: string;
  event_id: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
};

function readExpenseForm(formData: FormData): { error: string } | { values: ExpenseValues } {
  const description = String(formData.get("description") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!description) return { error: "Description is required." } as const;
  if (!expenseDate) return { error: "Expense date is required." } as const;

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." } as const;
  }

  return {
    values: {
      description,
      event_id: eventId || null,
      expense_date: expenseDate,
      amount,
      currency,
      receipt_url: receiptUrl || null,
      notes: notes || null,
    },
  } as const;
}

export async function createExpenseAction(formData: FormData): Promise<ExpenseActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to record an expense." };
  }

  const parsed = readExpenseForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_expenses").insert(parsed.values);
  if (error) {
    return { error: "Could not save the expense. Please try again." };
  }

  revalidatePath("/portal/expenses");
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

  const parsed = readExpenseForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("event_expenses").update(parsed.values).eq("id", id);
  if (error) {
    return { error: "Could not update the expense. Please try again." };
  }

  revalidatePath("/portal/expenses");
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
