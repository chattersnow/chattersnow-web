import type { RecordSaleInput } from "../sale-form";
import type { PaymentMethod } from "../sales-shared";

/**
 * Cart arithmetic, in integer cents.
 *
 * Money in this file is never a float. `0.1 + 0.2` is the canonical reason,
 * but the one that bites a register is subtler: a cart of three $5.05 stickers
 * with a $2.10 discount computes a total whose last cent depends on the order
 * the lines happened to be added in. Cents are exact, and the one conversion
 * back to dollars happens at the edge -- `cartTotals` for display, and the
 * discount the Server Action sends.
 */

/** A sellable variant as the register's tiles know it. */
export type RegisterVariant = {
  id: string;
  productId: string;
  productName: string;
  label: string;
  /** Dollars, as PostgREST hands numeric(10,2) over. */
  price: number | string;
  stockOnHand: number;
};

export type CartLine = {
  variantId: string;
  productName: string;
  label: string;
  /** Snapshot in cents, so a background refresh cannot reprice a cart mid-sale. */
  unitPriceCents: number;
  quantity: number;
  /** What the tile said was available when the line was added. */
  stockOnHand: number;
};

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  subtotal: number;
  discount: number;
  /** The rate the tax was computed at, as a percent, after clamping. */
  taxRate: number;
  tax: number;
  total: number;
  itemCount: number;
};

export type RegisterEvent = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
};

export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function lineLabel(variant: {
  productName: string;
  label: string;
}): string {
  return `${variant.productName} — ${variant.label}`;
}

/**
 * Adds one of a variant, or increments the line that is already there.
 *
 * Clamped at the stock the tile reported: overselling is the RPC's to refuse,
 * but a cashier should not be able to build a cart that cannot be recorded in
 * the first place. Returns the same array when nothing can be added, so a
 * caller can treat identity as "at the limit".
 */
export function addToCart(
  cart: readonly CartLine[],
  variant: RegisterVariant,
): CartLine[] {
  const existing = cart.find((line) => line.variantId === variant.id);
  if (existing) {
    return setLineQuantity(cart, variant.id, existing.quantity + 1);
  }
  if (variant.stockOnHand < 1) return [...cart];
  return [
    ...cart,
    {
      variantId: variant.id,
      productName: variant.productName,
      label: variant.label,
      unitPriceCents: toCents(variant.price),
      quantity: 1,
      stockOnHand: variant.stockOnHand,
    },
  ];
}

/** Sets a line's quantity, clamped to [1, stock]. Zero removes the line. */
export function setLineQuantity(
  cart: readonly CartLine[],
  variantId: string,
  quantity: number,
): CartLine[] {
  if (quantity < 1) return removeLine(cart, variantId);
  return cart.map((line) =>
    line.variantId === variantId
      ? { ...line, quantity: Math.min(quantity, line.stockOnHand) }
      : line,
  );
}

export function removeLine(
  cart: readonly CartLine[],
  variantId: string,
): CartLine[] {
  return cart.filter((line) => line.variantId !== variantId);
}

/** The largest rate the register accepts, as a percent. */
export const MAX_TAX_RATE_PERCENT = 100;

/**
 * The rate a typed figure means, as a percent rounded to three decimals --
 * what `sales.tax_rate` stores. Blank, unreadable, negative or over 100 all
 * read as 0: the register never charges tax it cannot explain.
 */
export function parseTaxRateInput(taxRateInput: string): number {
  const typed = Number(taxRateInput);
  if (
    taxRateInput.trim() === "" ||
    !Number.isFinite(typed) ||
    typed < 0 ||
    typed > MAX_TAX_RATE_PERCENT
  ) {
    return 0;
  }
  return Math.round(typed * 1000) / 1000;
}

/**
 * Subtotal, discount, tax and total.
 *
 * `discountInput` and `taxRateInput` are whatever was typed, so either may be
 * blank, a partial number ("1."), or out of range. An unreadable figure counts
 * as zero and an excessive discount is clamped to the subtotal -- the register
 * shows a total rather than NaN or a negative, and the RPC still refuses a
 * discount that exceeds the subtotal it priced itself.
 *
 * Tax is exclusive and computed on the net of discount, in cents, rounded
 * once for the whole sale -- the same arithmetic `record_product_sale` does
 * in SQL, so the Total the cashier reads is the Total that gets stored.
 */
export function cartTotals(
  cart: readonly CartLine[],
  discountInput: string,
  taxRateInput: string = "",
): CartTotals {
  const subtotalCents = cart.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const typed = Number(discountInput);
  const discountCents =
    discountInput.trim() === "" || !Number.isFinite(typed) || typed < 0
      ? 0
      : Math.min(Math.round(typed * 100), subtotalCents);
  const taxRate = parseTaxRateInput(taxRateInput);
  const taxCents = Math.round(
    ((subtotalCents - discountCents) * taxRate) / 100,
  );
  const totalCents = subtotalCents - discountCents + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    taxRate,
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
    itemCount: cart.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Which event the register should open against.
 *
 * A merch table is run at an event, and the operator has one in mind already,
 * so guessing it right is worth more than a tidy "choose one" placeholder:
 * an event happening right now, else the next one coming up, else the most
 * recent one that has been. Null only when the tenant has no events at all --
 * a sale with no event is legitimate (a one-off order) and stays selectable.
 */
export function pickDefaultEvent(
  events: readonly RegisterEvent[],
  now: Date,
): string | null {
  if (events.length === 0) return null;
  const at = now.getTime();

  const ongoing = events
    .filter((event) => {
      const start = new Date(event.startsAt).getTime();
      const end = event.endsAt ? new Date(event.endsAt).getTime() : start;
      return start <= at && at <= end;
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  if (ongoing.length > 0) return ongoing[0].id;

  const upcoming = events
    .filter((event) => new Date(event.startsAt).getTime() > at)
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  if (upcoming.length > 0) return upcoming[0].id;

  const past = events
    .filter((event) => new Date(event.startsAt).getTime() <= at)
    .sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  return past.length > 0 ? past[0].id : null;
}

/**
 * The payload `recordSaleAction` takes. Quantities and variant ids only -- the
 * RPC prices every line from the catalog, so nothing the cart believes about
 * money is sent or trusted. The tax goes the same way: a rate, never an
 * amount, and the RPC computes the amount from its own subtotal.
 */
export function buildRecordSaleInput({
  cart,
  eventId,
  purchaserPersonId,
  paymentMethod,
  discountInput,
  taxRateInput = "",
  notes,
}: {
  cart: readonly CartLine[];
  eventId: string | null;
  purchaserPersonId: string | null;
  paymentMethod: PaymentMethod;
  discountInput: string;
  taxRateInput?: string;
  notes: string;
}): RecordSaleInput {
  const totals = cartTotals(cart, discountInput, taxRateInput);
  return {
    event_id: eventId,
    purchaser_person_id: purchaserPersonId,
    payment_method: paymentMethod,
    discount_amount: totals.discount,
    tax_rate: totals.taxRate,
    notes: notes.trim() || null,
    lines: cart.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
    })),
  };
}
