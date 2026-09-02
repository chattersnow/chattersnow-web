import type { ParseResult } from "@/lib/forms";

export type DistributionEditFormData = {
  quantity: number;
  occurred_at: string;
  reason: string | null;
  recipient_person_id: string | null;
};

export function parseDistributionEditForm(
  formData: FormData,
): ParseResult<DistributionEditFormData> {
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = Number(quantityRaw);
  if (!quantityRaw || !Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }

  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!occurredAtRaw) {
    return { error: "Date & time is required." };
  }
  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) {
    return { error: "Enter a valid date & time." };
  }

  return {
    data: {
      quantity,
      occurred_at: occurredAt.toISOString(),
      reason: String(formData.get("reason") ?? "").trim() || null,
      recipient_person_id:
        String(formData.get("recipientPersonId") ?? "").trim() || null,
    },
  };
}
