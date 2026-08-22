export type ParseResult<T> = { data: T } | { error: string };

export type ExpenseFormData = {
  description: string;
  event_id: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
};

export function parseExpenseForm(formData: FormData): ParseResult<ExpenseFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!description) return { error: "Description is required." };
  if (!expenseDate) return { error: "Expense date is required." };

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." };
  }

  return {
    data: {
      description,
      event_id: eventId || null,
      expense_date: expenseDate,
      amount,
      currency,
      receipt_url: receiptUrl || null,
      notes: notes || null,
    },
  };
}
