import type { ParseResult } from "@/lib/forms";

export type ReimbursementFormData = {
  person_id: string;
  event_id: string | null;
  description: string;
  amount: number;
  currency: string;
  receipt_url: string | null;
  notes: string | null;
};

export function parseReimbursementForm(
  formData: FormData,
): ParseResult<ReimbursementFormData> {
  const personId = String(formData.get("personId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim() || "USD";
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!personId) return { error: "Select who is requesting reimbursement." };
  if (!description) return { error: "Description is required." };

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Amount must be a positive number." };
  }

  return {
    data: {
      person_id: personId,
      event_id: eventId || null,
      description,
      amount,
      currency,
      receipt_url: receiptUrl || null,
      notes: notes || null,
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
