import type { ParseResult } from "@/lib/forms";
import { isRevenueSource, type RevenueSource } from "./revenue-shared";

export type RevenueFormData = {
  event_id: string | null;
  source: RevenueSource;
  received_date: string;
  amount: number;
  notes: string | null;
};

export function parseRevenueForm(
  formData: FormData,
): ParseResult<RevenueFormData> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const sourceRaw = String(formData.get("source") ?? "").trim();
  const receivedDate = String(formData.get("receivedDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!isRevenueSource(sourceRaw)) return { error: "Source is required." };
  if (!receivedDate) return { error: "Date is required." };

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." };
  }

  return {
    data: {
      event_id: eventId || null,
      source: sourceRaw,
      received_date: receivedDate,
      amount,
      notes: notes || null,
    },
  };
}
