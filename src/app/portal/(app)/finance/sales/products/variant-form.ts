import type { ParseResult } from "@/lib/forms";
import { parseSortOrder } from "./product-form";

export type VariantFormData = {
  label: string;
  sku: string | null;
  price: number;
  stock_on_hand: number;
  is_active: boolean;
  sort_order: number;
};

/**
 * Whole units, never a fraction of one. `numeric(10,2) check (>= 0)` on the
 * price and `integer check (>= 0)` on the stock are the database's half of
 * this; rejecting here is what turns a constraint violation into a sentence
 * the person who typed it can act on.
 */
export function parseStockValue(
  raw: FormDataEntryValue | null,
): ParseResult<number> {
  const text = String(raw ?? "").trim();
  if (text === "") return { error: "Stock is required." };
  if (!/^\d+$/.test(text)) {
    return { error: "Stock must be a whole number, zero or more." };
  }
  return { data: Number(text) };
}

function parsePrice(raw: FormDataEntryValue | null): ParseResult<number> {
  const text = String(raw ?? "").trim();
  if (text === "") return { error: "Price is required." };
  // Matched as text, not by counting decimals on the parsed float: the column
  // is numeric(10,2), which rounds a third decimal silently rather than
  // refusing it, so $4.999 would be stored as $5.00 and the register would
  // quietly disagree with the receipt. This refuses instead. The pattern also
  // rules out the notations Number() accepts and a price never uses -- "1e2",
  // "0x10", "Infinity".
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return {
      error: "Price must be an amount like 20 or 19.99, with no minus sign.",
    };
  }
  return { data: Number(text) };
}

export function parseVariantForm(
  formData: FormData,
): ParseResult<VariantFormData> {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Variant name is required." };

  const price = parsePrice(formData.get("price"));
  if ("error" in price) return price;

  const stock = parseStockValue(formData.get("stockOnHand"));
  if ("error" in stock) return stock;

  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sortOrder === null) {
    return { error: "Sort order must be a positive number." };
  }

  const sku = String(formData.get("sku") ?? "").trim();

  return {
    data: {
      label,
      // null, not "": the unique index on (tenant_id, sku) is partial on
      // `sku is not null`, so several variants may go without one. Empty
      // strings would collide with each other on the second unlabelled
      // variant.
      sku: sku || null,
      price: price.data,
      stock_on_hand: stock.data,
      is_active: formData.get("isActive") !== "off",
      sort_order: sortOrder,
    },
  };
}
