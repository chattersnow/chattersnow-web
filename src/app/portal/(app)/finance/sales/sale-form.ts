import type { ParseResult } from "@/lib/forms";
import { isPaymentMethod, type PaymentMethod } from "./sales-shared";

/** One cart line as the register submits it. */
export type RecordSaleLine = { variant_id: string; quantity: number };

export type RecordSaleInput = {
  event_id: string | null;
  purchaser_person_id: string | null;
  payment_method: PaymentMethod;
  discount_amount: number;
  /** Percent, 0-100, three decimals. The RPC derives the amount. */
  tax_rate: number;
  notes: string | null;
  lines: RecordSaleLine[];
};

export type SaleEditData = {
  event_id: string | null;
  purchaser_person_id: string | null;
  notes: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) return undefined;
  return value;
}

/**
 * The register's payload, validated at the Server Action boundary.
 *
 * It arrives as an object rather than FormData -- the cart is a list, and a
 * flat form would have to encode it -- so `unknown` is the honest input type:
 * a Server Action's arguments are a public API, and nothing about being called
 * from our own client component is enforced at runtime.
 *
 * Deliberately *not* a price check. Prices and totals are read from the
 * catalog inside `record_product_sale`, never taken from the client, so the
 * only money this parser sees is the discount somebody typed.
 */
export function parseRecordSaleInput(
  input: unknown,
): ParseResult<RecordSaleInput> {
  if (typeof input !== "object" || input === null) {
    return { error: "Could not read the sale. Please try again." };
  }
  const raw = input as Record<string, unknown>;

  const eventId = optionalId(raw.event_id);
  if (eventId === undefined) return { error: "Choose a valid event." };

  const purchaserId = optionalId(raw.purchaser_person_id);
  if (purchaserId === undefined) return { error: "Choose a valid purchaser." };

  if (!isPaymentMethod(raw.payment_method as string | undefined)) {
    return { error: "Choose how the sale was paid." };
  }

  const discountRaw = raw.discount_amount;
  const discount =
    discountRaw === null || discountRaw === undefined || discountRaw === ""
      ? 0
      : Number(discountRaw);
  if (!Number.isFinite(discount) || discount < 0) {
    return { error: "Discount must be zero or more." };
  }

  // A rate, never an amount: the amount is the RPC's to compute from the
  // subtotal it prices itself (#997). Absent reads as untaxed, so a caller
  // written before tax existed still records a sale.
  const taxRateRaw = raw.tax_rate;
  const taxRate =
    taxRateRaw === null || taxRateRaw === undefined || taxRateRaw === ""
      ? 0
      : Number(taxRateRaw);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: "Tax rate must be between 0 and 100 percent." };
  }

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    return { error: "Add at least one item before recording the sale." };
  }

  const lines: RecordSaleLine[] = [];
  for (const line of raw.lines) {
    if (typeof line !== "object" || line === null) {
      return { error: "Every line needs a product and a quantity." };
    }
    const { variant_id: variantId, quantity } = line as Record<string, unknown>;
    if (typeof variantId !== "string" || !UUID.test(variantId)) {
      return { error: "Every line needs a product and a quantity." };
    }
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return { error: "Every quantity must be a whole number of one or more." };
    }
    lines.push({ variant_id: variantId, quantity });
  }

  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";

  return {
    data: {
      event_id: eventId,
      purchaser_person_id: purchaserId,
      payment_method: raw.payment_method as PaymentMethod,
      // Rounded to cents here rather than left to Postgres: numeric(10,2)
      // would round it anyway, and the total the toast reports is computed
      // from this figure client-side.
      discount_amount: Math.round(discount * 100) / 100,
      // Three decimals, matching numeric(6,3) on sales.tax_rate.
      tax_rate: Math.round(taxRate * 1000) / 1000,
      notes: notes || null,
      lines,
    },
  };
}

/**
 * The details sheet's edit, which is the three fields `sales` has a column
 * grant for (20260911040000). Money, stock and void state belong to the RPCs,
 * so nothing here can reach them however the form is posted.
 */
export function parseSaleEditForm(
  formData: FormData,
): ParseResult<SaleEditData> {
  const eventId = optionalId(formData.get("eventId"));
  if (eventId === undefined) return { error: "Choose a valid event." };

  const purchaserId = optionalId(formData.get("purchaserPersonId"));
  if (purchaserId === undefined) return { error: "Choose a valid purchaser." };

  const notes = String(formData.get("notes") ?? "").trim();

  return {
    data: {
      event_id: eventId,
      purchaser_person_id: purchaserId,
      notes: notes || null,
    },
  };
}
