import type { PostgrestError } from "@supabase/supabase-js";

export type SaleStatus = "completed" | "voided";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A sale is paid by the same means a monetary donation is, so the list, the
 * labels and the type come from there rather than being retyped. The column's
 * check constraint took `monetary_donations.method`'s list verbatim for the
 * same reason (20260911040000): the same money arriving by the same means, and
 * a finance report that groups both must not have to reconcile two
 * vocabularies.
 */
export {
  PAYMENT_METHODS,
  isPaymentMethod,
  paymentMethodLabel,
  type PaymentMethod,
} from "../donations/donations-shared";

export type SaleLineItemRow = {
  id: string;
  /** Null for a custom item rung up at the register (#1015). */
  product_variant_id: string | null;
  description: string;
  /** numeric(10,2) arrives from PostgREST as a string. */
  unit_price: number | string;
  /** The catalog price at the moment of sale; null for a custom line (#1015). */
  list_price: number | string | null;
  quantity: number;
  line_total: number | string;
};

/**
 * Whether the cashier charged this line something other than the catalog price.
 *
 * Derived from the two snapshots rather than read from a flag, because that is
 * how the database decides it too: `record_product_sale` looks the catalog
 * price up itself and stores it as `list_price` beside whatever was charged, so
 * there is no client-set "overridden" to be wrong. A custom line has no list
 * price to differ from and is never overridden -- it is simply custom.
 */
export function lineIsOverridden(line: SaleLineItemRow): boolean {
  if (line.list_price === null || line.list_price === undefined) return false;
  return Number(line.unit_price) !== Number(line.list_price);
}

export type SalePurchaser = {
  id: string;
  name: string | null;
  preferred_name: string | null;
};

export type SaleRow = {
  id: string;
  event_id: string | null;
  purchaser_person_id: string | null;
  sold_at: string;
  payment_method: string;
  subtotal: number | string;
  discount_amount: number | string;
  /** Percent, snapshotted at the register (#997). */
  tax_rate: number | string;
  tax_amount: number | string;
  total: number | string;
  status: SaleStatus;
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  events: { name: string } | null;
  purchaser: SalePurchaser | null;
  sale_line_items: SaleLineItemRow[];
};

export type EventOption = { id: string; name: string };

/**
 * The purchaser embed names its foreign key. Every foreign key on `sales` is
 * composite -- `(tenant_id, purchaser_person_id)` since #707 Phase 2 -- and
 * `tenant_id` is itself a foreign key to `tenants`, so `people(...)` leaves
 * PostgREST more than one join path to choose between. Naming the constraint
 * removes the choice.
 */
export const SALE_COLUMNS =
  "id, event_id, purchaser_person_id, sold_at, payment_method, subtotal, " +
  "discount_amount, tax_rate, tax_amount, total, status, voided_at, " +
  "void_reason, notes, " +
  "events(name), " +
  "purchaser:people!sales_tenant_id_purchaser_person_id_fkey(id, name, preferred_name), " +
  "sale_line_items(id, product_variant_id, description, unit_price, list_price, quantity, line_total)";

/**
 * "8.25%" -- a rate as the ledger shows it. Up to three decimals, trailing
 * zeros dropped, so a whole-number rate reads "7%" and a thousandth rate reads
 * "8.375%" without either looking padded.
 */
export function formatTaxRate(rate: number | string): string {
  const numeric = Number(rate);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `${Number(safe.toFixed(3))}%`;
}

/** How many items were in a sale — the ledger's Items column. */
export function saleItemCount(sale: SaleRow): number {
  return (sale.sale_line_items ?? []).reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
}

export const SALE_FALLBACK_ERROR =
  "Could not record the sale. Please try again.";

/**
 * The sentences behind `record_product_sale` / `void_product_sale`'s error
 * codes (20260911050000).
 *
 * The RPCs raise SCREAMING_SNAKE codes rather than prose so the wording stays
 * a product decision here rather than a migration's -- and so the register can
 * say something useful about the two codes that carry data in `details`: which
 * variant ran short, and how many of it are actually on hand.
 */
export function saleRpcErrorMessage(
  error: Pick<PostgrestError, "message" | "details"> | null | undefined,
  fallback: string = SALE_FALLBACK_ERROR,
): string {
  const code = error?.message?.trim() ?? "";
  const detail = error?.details?.trim();

  switch (code) {
    case "NOT_AUTHORIZED":
      return "You don't have permission to perform this action.";
    case "INVALID_PAYMENT_METHOD":
      return "Choose how the sale was paid.";
    case "INVALID_DISCOUNT":
      return "A discount cannot be negative.";
    case "DISCOUNT_EXCEEDS_SUBTOTAL":
      return "The discount is more than the sale comes to.";
    case "INVALID_TAX_RATE":
      return "Tax rate must be between 0 and 100 percent.";
    case "LINES_REQUIRED":
      return "Add at least one item before recording the sale.";
    case "INVALID_LINE":
      return detail === "one price per item per sale"
        ? "One item can only be sold at one price per sale. Record the second price as its own sale."
        : "Every line needs a product and a quantity of at least one.";
    case "INVALID_UNIT_PRICE":
      // The detail names the line, but for a catalog line the only name the
      // RPC has at validation time -- before it takes the lock that would let
      // it read the product -- is the variant id, which means nothing to a
      // cashier. The generic sentence is better than an id in prose.
      return detail && !UUID.test(detail)
        ? `The price on ${detail} is not an amount we can charge.`
        : "A price must be an amount of zero or more, to the cent.";
    case "EVENT_NOT_FOUND":
      return "That event no longer exists. Pick another one.";
    case "PERSON_NOT_FOUND":
      return "That person no longer exists. Search for them again.";
    case "VARIANT_NOT_FOUND":
      return "Something in the cart no longer exists. Reload the register and try again.";
    case "VARIANT_INACTIVE":
      return detail
        ? `${detail} has been retired and cannot be sold.`
        : "Something in the cart has been retired and cannot be sold.";
    case "INSUFFICIENT_STOCK":
      return detail
        ? `Not enough stock — ${detail}.`
        : "There is not enough stock for this sale.";
    case "SALE_NOT_FOUND":
      return "That sale no longer exists.";
    case "SALE_ALREADY_VOIDED":
      return "This sale has already been voided, and its stock is already back.";
    default:
      return fallback;
  }
}
