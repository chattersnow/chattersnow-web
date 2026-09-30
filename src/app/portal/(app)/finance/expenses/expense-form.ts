import type { ParseResult } from "@/lib/forms";
import { parseReceiptFields } from "@/lib/finance/receipt";

export type ExpenseFormData = {
  description: string;
  event_id: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  receipt_url: string | null;
  receipt_path: string | null;
  notes: string | null;
  paid_by_person_id: string | null;
};

export function parseExpenseForm(
  formData: FormData,
): ParseResult<ExpenseFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const notes = String(formData.get("notes") ?? "").trim();
  const paidByPersonId = String(formData.get("paidByPersonId") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!expenseDate) return { error: "Expense date is required." };

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." };
  }

  const receipt = parseReceiptFields(formData);
  if ("error" in receipt) return receipt;

  return {
    data: {
      description,
      event_id: eventId || null,
      expense_date: expenseDate,
      amount,
      currency,
      ...receipt.data,
      notes: notes || null,
      paid_by_person_id: paidByPersonId || null,
    },
  };
}

export function parseRejectReason(reason: string): ParseResult<string> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { error: "A rejection reason is required." };
  }
  return { data: trimmed };
}
