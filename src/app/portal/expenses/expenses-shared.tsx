export type ExpenseRow = {
  id: string;
  event_id: string | null;
  description: string;
  expense_date: string;
  amount: number | string;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
  events: { name: string } | null;
};

export type EventOption = { id: string; name: string };

export const CURRENCIES = [{ value: "USD", label: "USD" }];

export function formatAmount(amount: number | string, currency: string) {
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numeric)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatExpenseDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}
