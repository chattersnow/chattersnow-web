import type { ParseResult } from "@/lib/forms";
import { isPaymentMethod, type PaymentMethod } from "./donations-shared";

export type DonationFormData = {
  donor_id: string | null;
  event_id: string | null;
  amount: number;
  method: PaymentMethod;
  received_date: string;
  notes: string | null;
};

export function parseDonationForm(
  formData: FormData,
): ParseResult<DonationFormData> {
  const donorId = String(formData.get("donorId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "").trim();
  const receivedDate = String(formData.get("receivedDate") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!isPaymentMethod(methodRaw)) {
    return { error: "Payment method is required." };
  }
  if (!receivedDate) return { error: "Date is required." };

  const amount = amountRaw ? Number(amountRaw) : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." };
  }

  return {
    data: {
      donor_id: donorId || null,
      event_id: eventId || null,
      amount,
      method: methodRaw,
      received_date: receivedDate,
      notes: notes || null,
    },
  };
}
