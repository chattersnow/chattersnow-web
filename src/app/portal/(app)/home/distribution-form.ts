import type { ParseResult } from "@/lib/forms";

export type RecordDistributionInput = {
  inventoryItemId: string;
  quantity: number;
  reason?: string;
  occurredAt?: string;
  markDistributed: boolean;
  eventId?: string;
  recipientPersonId?: string;
};

export type DistributionRpcArgs = {
  p_inventory_item_id: string;
  p_quantity: number;
  p_reason: string | null;
  p_event_id: string | null;
  p_recipient_person_id: string | null;
  p_occurred_at: string;
  p_mark_item_distributed: boolean;
};

export function parseDistributionInput(input: RecordDistributionInput): ParseResult<DistributionRpcArgs> {
  const inventoryItemId = input.inventoryItemId.trim();
  if (!inventoryItemId) {
    return { error: "Select an inventory item." };
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();

  return {
    data: {
      p_inventory_item_id: inventoryItemId,
      p_quantity: input.quantity,
      p_reason: input.reason?.trim() || null,
      p_event_id: input.eventId ?? null,
      p_recipient_person_id: input.recipientPersonId ?? null,
      p_occurred_at: occurredAt,
      p_mark_item_distributed: input.markDistributed,
    },
  };
}
