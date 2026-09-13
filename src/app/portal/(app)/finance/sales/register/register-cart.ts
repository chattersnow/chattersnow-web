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
  /**
   * Identity for the React key and for every mutation below. A catalog line
   * uses its variant id, since a cart holds at most one line per variant; a
   * custom line has no catalog identity at all, so it gets a fresh uuid.
   */
  lineId: string;
  /** Null for a custom item, which is not in the catalog (#1015). */
  variantId: string | null;
  productName: string;
  label: string;
  /** What a custom line is called. Null for a catalog line, which is named by the catalog. */
  description: string | null;
  /** Snapshot in cents, so a background refresh cannot reprice a cart mid-sale. */
  unitPriceCents: number;
  /**
   * The catalog price in cents, kept beside the charged one so the register can
   * say "was $20.00" and so the payload can tell an override from a default.
   * Null for a custom line, which has no catalog price to differ from.
   */
  listPriceCents: number | null;
  quantity: number;
  /**
   * What the tile said was available when the line was added. Null means
   * unlimited -- a custom line sells something that was never counted.
   */
  stockOnHand: number | null;
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

/** What a cart line is called: its own description, or the catalog's name for it. */
export function cartLineLabel(line: CartLine): string {
  return line.description ?? lineLabel(line);
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
    return setLineQuantity(cart, existing.lineId, existing.quantity + 1);
  }
  if (variant.stockOnHand < 1) return [...cart];
  return [
    ...cart,
    {
      lineId: variant.id,
      variantId: variant.id,
      productName: variant.productName,
      label: variant.label,
      description: null,
      unitPriceCents: toCents(variant.price),
      listPriceCents: toCents(variant.price),
      quantity: 1,
      stockOnHand: variant.stockOnHand,
    },
  ];
}

/**
 * Adds an item that is not in the catalog -- a donated one-off, a coffee
 * (#1015).
 *
 * Never merged with anything: two custom lines that happen to read the same are
 * still two things somebody typed, and the database treats their null variant
 * ids as distinct. An unreadable price is zero, the same treatment the discount
 * input gets, and the dialog refuses to submit one anyway.
 */
export function addCustomLine(
  cart: readonly CartLine[],
  {
    description,
    priceInput,
    quantity = 1,
  }: { description: string; priceInput: string; quantity?: number },
): CartLine[] {
  const trimmed = description.trim();
  return [
    ...cart,
    {
      lineId: crypto.randomUUID(),
      variantId: null,
      productName: trimmed,
      label: "",
      description: trimmed,
      unitPriceCents: parsePriceInput(priceInput) ?? 0,
      listPriceCents: null,
      quantity: Math.max(1, Math.trunc(quantity)),
      stockOnHand: null,
    },
  ];
}

/**
 * Sets a line's quantity, clamped to [1, stock]. Zero removes the line.
 *
 * A custom line has no stock to clamp against (`stockOnHand` null), so it is
 * only floored at one.
 */
export function setLineQuantity(
  cart: readonly CartLine[],
  lineId: string,
  quantity: number,
): CartLine[] {
  if (quantity < 1) return removeLine(cart, lineId);
  return cart.map((line) =>
    line.lineId === lineId
      ? {
          ...line,
          quantity:
            line.stockOnHand === null
              ? quantity
              : Math.min(quantity, line.stockOnHand),
        }
      : line,
  );
}

export function removeLine(
  cart: readonly CartLine[],
  lineId: string,
): CartLine[] {
  return cart.filter((line) => line.lineId !== lineId);
}

/** The largest price a line may carry, in cents -- the ceiling of numeric(10,2). */
const MAX_PRICE_CENTS = 100000000 * 100 - 1;

/**
 * A typed price as cents, or null when there is nothing readable to charge.
 *
 * The same clamp-and-ignore-garbage treatment `cartTotals` gives the discount:
 * blank, a partial number ("1."), a negative or an absurd figure all read as
 * "no figure", and the caller decides what that means for it.
 */
function parsePriceInput(priceInput: string): number | null {
  const typed = Number(priceInput);
  if (priceInput.trim() === "" || !Number.isFinite(typed) || typed < 0) {
    return null;
  }
  return Math.min(Math.round(typed * 100), MAX_PRICE_CENTS);
}

/**
 * Charges a line something other than its catalog price (#1015) -- a damaged
 * shirt at half price, a volunteer rate, "take it for $5".
 *
 * Blank restores the catalog price, which is the undo; a line with no catalog
 * price to go back to (a custom one) keeps what it has rather than falling to
 * zero on a keystroke.
 */
export function setLineUnitPrice(
  cart: readonly CartLine[],
  lineId: string,
  priceInput: string,
): CartLine[] {
  const cents = parsePriceInput(priceInput);
  return cart.map((line) => {
    if (line.lineId !== lineId) return line;
    const next = cents ?? line.listPriceCents ?? line.unitPriceCents;
    return { ...line, unitPriceCents: next };
  });
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
 * The payload `recordSaleAction` takes.
 *
 * An ordinary line is still ids and quantities only: the RPC prices it from the
 * catalog, and nothing the cart believes about money is sent. A price is sent
 * in exactly two cases (#1015) -- a line the cashier repriced, and a custom
 * item the catalog has never heard of -- and even then the RPC validates it and
 * snapshots the catalog price beside it, so what "overridden" means stays the
 * database's to decide. The tax goes the same way it always has: a rate, never
 * an amount.
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
    lines: cart.map((line) =>
      line.variantId === null
        ? {
            description: line.description ?? "",
            unit_price: fromCents(line.unitPriceCents),
            quantity: line.quantity,
          }
        : {
            variant_id: line.variantId,
            quantity: line.quantity,
            // Omitted entirely when the line is at its catalog price, so an
            // ordinary sale sends exactly what it sent before this existed.
            ...(line.unitPriceCents === line.listPriceCents
              ? {}
              : { unit_price: fromCents(line.unitPriceCents) }),
          },
    ),
  };
}
