import { describe, expect, test } from "bun:test";
import {
  parseDistributionInput,
  type RecordDistributionInput,
} from "./distribution-form";

function input(
  overrides: Partial<RecordDistributionInput> = {},
): RecordDistributionInput {
  return {
    inventoryItemId: "item-1",
    quantity: 1,
    markDistributed: true,
    ...overrides,
  };
}

describe("parseDistributionInput", () => {
  test("requires an inventory item", () => {
    expect(parseDistributionInput(input({ inventoryItemId: "" }))).toEqual({
      error: "Select an inventory item.",
    });
  });

  test("rejects a zero quantity", () => {
    expect(parseDistributionInput(input({ quantity: 0 }))).toEqual({
      error: "Quantity must be a whole number greater than zero.",
    });
  });

  test("rejects a non-integer quantity", () => {
    expect(parseDistributionInput(input({ quantity: 1.5 }))).toEqual({
      error: "Quantity must be a whole number greater than zero.",
    });
  });

  test("defaults event and recipient to null when omitted", () => {
    const result = parseDistributionInput(input());
    expect("data" in result && result.data.p_event_id).toBeNull();
    expect("data" in result && result.data.p_recipient_person_id).toBeNull();
  });

  test("passes through eventId and recipientPersonId when provided", () => {
    const result = parseDistributionInput(
      input({ eventId: "event-1", recipientPersonId: "person-1" }),
    );
    expect("data" in result && result.data.p_event_id).toBe("event-1");
    expect("data" in result && result.data.p_recipient_person_id).toBe(
      "person-1",
    );
  });

  test("defaults occurredAt to now when omitted", () => {
    const before = Date.now();
    const result = parseDistributionInput(input());
    const occurredAt =
      "data" in result ? new Date(result.data.p_occurred_at).getTime() : NaN;
    expect(occurredAt).toBeGreaterThanOrEqual(before);
  });

  test("uses the provided occurredAt when present", () => {
    const result = parseDistributionInput(
      input({ occurredAt: "2026-06-01T12:00:00.000Z" }),
    );
    expect("data" in result && result.data.p_occurred_at).toBe(
      "2026-06-01T12:00:00.000Z",
    );
  });

  test("respects markDistributed=false", () => {
    const result = parseDistributionInput(input({ markDistributed: false }));
    expect("data" in result && result.data.p_mark_item_distributed).toBe(false);
  });
});
