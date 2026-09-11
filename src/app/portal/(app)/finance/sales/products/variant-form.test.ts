import { describe, expect, test } from "bun:test";
import { parseStockValue, parseVariantForm } from "./variant-form";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

const VALID = { label: "M", price: "25.00", stockOnHand: "12" };

describe("parseVariantForm", () => {
  test("parses a complete variant", () => {
    const result = parseVariantForm(
      form({ ...VALID, sku: " CS-TEE-M ", sortOrder: "20" }),
    );
    expect(result).toEqual({
      data: {
        label: "M",
        sku: "CS-TEE-M",
        price: 25,
        stock_on_hand: 12,
        is_active: true,
        sort_order: 20,
      },
    });
  });

  test("an omitted SKU becomes null, not an empty string", () => {
    // The unique index on (tenant_id, sku) is partial on `sku is not null`, so
    // empty strings would collide on the second variant that has no SKU.
    expect(parseVariantForm(form({ ...VALID, sku: "  " }))).toMatchObject({
      data: { sku: null },
    });
  });

  test("requires a label", () => {
    expect(parseVariantForm(form({ ...VALID, label: " " }))).toEqual({
      error: "Variant name is required.",
    });
  });

  test("accepts a free variant but not a negative price", () => {
    expect(parseVariantForm(form({ ...VALID, price: "0" }))).toMatchObject({
      data: { price: 0 },
    });
    expect(parseVariantForm(form({ ...VALID, price: "-1" }))).toEqual({
      error: "Price must be an amount like 20 or 19.99, with no minus sign.",
    });
  });

  test("refuses a third decimal rather than letting numeric(10,2) round it", () => {
    // $4.999 would be stored as $5.00 and the receipt would disagree with what
    // was typed.
    expect(parseVariantForm(form({ ...VALID, price: "4.999" }))).toEqual({
      error: "Price must be an amount like 20 or 19.99, with no minus sign.",
    });
  });

  test("refuses notations Number() would accept and a price never uses", () => {
    for (const price of ["1e2", "0x10", "Infinity", " "]) {
      expect(parseVariantForm(form({ ...VALID, price }))).toHaveProperty(
        "error",
      );
    }
  });

  test("requires whole units of stock", () => {
    expect(parseVariantForm(form({ ...VALID, stockOnHand: "1.5" }))).toEqual({
      error: "Stock must be a whole number, zero or more.",
    });
  });
});

describe("parseStockValue", () => {
  test("accepts zero — a sold-out variant is still a variant", () => {
    expect(parseStockValue("0")).toEqual({ data: 0 });
  });

  test("rejects a blank, a fraction and a negative", () => {
    expect(parseStockValue("")).toEqual({ error: "Stock is required." });
    expect(parseStockValue("2.5")).toHaveProperty("error");
    expect(parseStockValue("-4")).toHaveProperty("error");
  });
});
