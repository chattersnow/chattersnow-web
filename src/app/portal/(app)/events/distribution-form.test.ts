import { describe, expect, test } from "bun:test";
import { parseDistributionForm } from "./distribution-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseDistributionForm", () => {
  test("requires an inventory item", () => {
    expect(parseDistributionForm(formData({ quantity: "1" }))).toEqual({
      error: "Select an inventory item.",
    });
  });

  test("rejects a zero quantity", () => {
    expect(
      parseDistributionForm(formData({ inventoryItemId: "item-1", quantity: "0" }))
    ).toEqual({ error: "Quantity must be a whole number greater than zero." });
  });

  test("rejects a non-integer quantity", () => {
    expect(
      parseDistributionForm(formData({ inventoryItemId: "item-1", quantity: "1.5" }))
    ).toEqual({ error: "Quantity must be a whole number greater than zero." });
  });

  test("defaults markDistributed to true unless explicitly off", () => {
    const result = parseDistributionForm(formData({ inventoryItemId: "item-1", quantity: "1" }));
    expect("data" in result && result.data.markDistributed).toBe(true);
  });

  test("respects markDistributed=off", () => {
    const result = parseDistributionForm(
      formData({ inventoryItemId: "item-1", quantity: "1", markDistributed: "off" })
    );
    expect("data" in result && result.data.markDistributed).toBe(false);
  });

  test("falls back to the injected clock when occurredAt is omitted", () => {
    const fixed = new Date("2026-01-01T00:00:00.000Z");
    const result = parseDistributionForm(
      formData({ inventoryItemId: "item-1", quantity: "1" }),
      () => fixed
    );
    expect("data" in result && result.data.occurredAt).toBe(fixed.toISOString());
  });

  test("uses the provided occurredAt when present", () => {
    const result = parseDistributionForm(
      formData({ inventoryItemId: "item-1", quantity: "1", occurredAt: "2026-06-01T12:00:00.000Z" })
    );
    expect("data" in result && result.data.occurredAt).toBe("2026-06-01T12:00:00.000Z");
  });
});
