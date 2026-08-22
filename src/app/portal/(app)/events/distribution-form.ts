export type ParseResult<T> = { data: T } | { error: string };

export type DistributionFormData = {
  inventoryItemId: string;
  quantity: number;
  reason: string | null;
  occurredAt: string;
  markDistributed: boolean;
};

export function parseDistributionForm(
  formData: FormData,
  now: () => Date = () => new Date()
): ParseResult<DistributionFormData> {
  const inventoryItemId = String(formData.get("inventoryItemId") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const markDistributed = formData.get("markDistributed") !== "off";

  if (!inventoryItemId) {
    return { error: "Select an inventory item." };
  }

  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }

  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw).toISOString() : now().toISOString();

  return {
    data: {
      inventoryItemId,
      quantity,
      reason: reason || null,
      occurredAt,
      markDistributed,
    },
  };
}
