import type { ParseResult } from "@/lib/forms";
import { isPaymentMethod, type PaymentMethod } from "./sales-shared";

/** A line for something in the catalog. `unit_price` is present only when the cashier changed it. */
export type RecordSaleCatalogLine = {
  variant_id: string;
  quantity: number;
  unit_price?: number;
};

/** A line for something that is not in the catalog at all (#1015). */
export type RecordSaleCustomLine = {
  description: string;
  unit_price: number;
  quantity: number;
};

/** One cart line as the register submits it. */
export type RecordSaleLine = RecordSaleCatalogLine | RecordSaleCustomLine;

/** As long a description as a custom line may carry, matching the table's check. */
export const MAX_CUSTOM_DESCRIPTION = 120;

/** One cent under the ceiling of numeric(10,2), which is what a price column is. */
const MAX_UNIT_PRICE = 99999999.99;

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
 * A price *is* checked here, which it deliberately was not before #1015. The
 * boundary moved rather than disappeared: a catalog line may carry a
 * `unit_price` the cashier typed, and a custom line must, but in both cases the
 * figure is only a proposal. `record_product_sale` still prices the catalog
 * itself, snapshots that as the line's `list_price`, and decides from the two
 * figures whether the line was overridden. What this parser owes the RPC is a
 * number of the right shape -- finite, not negative, in cents, inside
 * `numeric(10,2)` -- so a malformed payload fails with a sentence here rather
 * than as a Postgres cast error there.
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
    const {
      variant_id: variantId,
      quantity,
      unit_price: unitPrice,
      description,
    } = line as Record<string, unknown>;

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return { error: "Every quantity must be a whole number of one or more." };
    }

    // A price is optional on a catalog line and required on a custom one, so it
    // is shape-checked once here and required below where it belongs.
    const hasPrice = unitPrice !== null && unitPrice !== undefined;
    if (
      hasPrice &&
      (typeof unitPrice !== "number" ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        unitPrice > MAX_UNIT_PRICE)
    ) {
      return { error: "A price must be a number of zero or more." };
    }
    // Rounded to cents for the same reason the discount is: numeric(10,2) would
    // round it anyway, and the RPC refuses a third decimal rather than silently
    // charging a different figure.
    const price = hasPrice
      ? Math.round((unitPrice as number) * 100) / 100
      : undefined;

    if (variantId === null || variantId === undefined) {
      // A custom line. Both of the things the catalog would have supplied have
      // to come with it.
      if (typeof description !== "string" || description.trim() === "") {
        return { error: "A custom item needs a description." };
      }
      if (description.trim().length > MAX_CUSTOM_DESCRIPTION) {
        return {
          error: `A custom item's description must be ${MAX_CUSTOM_DESCRIPTION} characters or fewer.`,
        };
      }
      if (price === undefined) {
        return { error: "A custom item needs a price." };
      }
      lines.push({
        description: description.trim(),
        unit_price: price,
        quantity,
      });
      continue;
    }

    if (typeof variantId !== "string" || !UUID.test(variantId)) {
      return { error: "Every line needs a product and a quantity." };
    }
    // A catalog line's description is the RPC's to compose from the product and
    // the variant, so one arriving here means the caller built the wrong shape.
    if (description !== null && description !== undefined) {
      return { error: "Every line needs a product and a quantity." };
    }
    lines.push({
      variant_id: variantId,
      quantity,
      ...(price === undefined ? {} : { unit_price: price }),
    });
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
