import { describe, expect, test } from "bun:test";
import {
  addToCart,
  buildRecordSaleInput,
  cartTotals,
  pickDefaultEvent,
  removeLine,
  setLineQuantity,
  type CartLine,
  type RegisterEvent,
  type RegisterVariant,
} from "./register-cart";

function variant(overrides: Partial<RegisterVariant> = {}): RegisterVariant {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    productId: "22222222-2222-4222-8222-222222222222",
    productName: "Chatter Snow Beanie",
    label: "One size",
    price: "20.00",
    stockOnHand: 3,
    ...overrides,
  };
}

describe("addToCart", () => {
  test("adds a line, then increments it rather than duplicating", () => {
    const first = addToCart([], variant());
    expect(first).toHaveLength(1);
    expect(first[0].quantity).toBe(1);
    expect(first[0].unitPriceCents).toBe(2000);

    const second = addToCart(first, variant());
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(2);
  });

  test("stops at the stock the tile reported", () => {
    let cart: CartLine[] = [];
    for (let i = 0; i < 5; i++) cart = addToCart(cart, variant());
    expect(cart[0].quantity).toBe(3);
  });

  test("a sold-out variant adds nothing", () => {
    expect(addToCart([], variant({ stockOnHand: 0 }))).toEqual([]);
  });
});

describe("setLineQuantity", () => {
  const cart = addToCart([], variant());

  test("clamps upward to stock", () => {
    expect(setLineQuantity(cart, variant().id, 9)[0].quantity).toBe(3);
  });

  test("zero or less removes the line", () => {
    expect(setLineQuantity(cart, variant().id, 0)).toEqual([]);
    expect(setLineQuantity(cart, variant().id, -2)).toEqual([]);
  });

  test("leaves other lines alone", () => {
    const two = addToCart(
      cart,
      variant({ id: "33333333-3333-4333-8333-333333333333" }),
    );
    const after = setLineQuantity(two, variant().id, 2);
    expect(after[0].quantity).toBe(2);
    expect(after[1].quantity).toBe(1);
  });
});

describe("removeLine", () => {
  test("drops only the named variant", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const cart = addToCart(addToCart([], variant()), variant({ id: other }));
    expect(
      removeLine(cart, variant().id).map((line) => line.variantId),
    ).toEqual([other]);
  });
});

describe("cartTotals", () => {
  // The float case this file exists for: three $5.05 stickers are $15.15, and
  // 5.05 * 3 in binary floating point is 15.149999999999999.
  const stickers = [
    {
      price: "5.05",
      stockOnHand: 10,
      id: "44444444-4444-4444-8444-444444444444",
    },
  ];

  test("sums in cents, not floats", () => {
    let cart: CartLine[] = [];
    for (let i = 0; i < 3; i++) cart = addToCart(cart, variant(stickers[0]));
    const totals = cartTotals(cart, "");
    expect(totals.subtotalCents).toBe(1515);
    expect(totals.subtotal).toBe(15.15);
    expect(totals.itemCount).toBe(3);
  });

  test("an unreadable discount counts as zero", () => {
    const cart = addToCart([], variant());
    for (const input of ["", "   ", "abc", "-5"]) {
      expect(cartTotals(cart, input).discountCents).toBe(0);
    }
  });

  test("a discount larger than the cart is clamped, never negative", () => {
    const cart = addToCart([], variant());
    const totals = cartTotals(cart, "99");
    expect(totals.discountCents).toBe(2000);
    expect(totals.totalCents).toBe(0);
  });

  test("an empty cart totals zero", () => {
    expect(cartTotals([], "5")).toMatchObject({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      itemCount: 0,
    });
  });
});

describe("pickDefaultEvent", () => {
  const now = new Date("2026-06-15T18:00:00.000Z");

  function event(
    id: string,
    startsAt: string,
    endsAt: string | null = null,
  ): RegisterEvent {
    return { id, name: id, startsAt, endsAt };
  }

  test("an event happening now wins", () => {
    const events = [
      event("upcoming", "2026-06-20T10:00:00.000Z"),
      event("ongoing", "2026-06-15T16:00:00.000Z", "2026-06-15T22:00:00.000Z"),
      event("past", "2026-06-01T10:00:00.000Z"),
    ];
    expect(pickDefaultEvent(events, now)).toBe("ongoing");
  });

  test("otherwise the next one coming up, earliest first", () => {
    const events = [
      event("later", "2026-07-01T10:00:00.000Z"),
      event("sooner", "2026-06-20T10:00:00.000Z"),
      event("past", "2026-06-01T10:00:00.000Z"),
    ];
    expect(pickDefaultEvent(events, now)).toBe("sooner");
  });

  test("otherwise the most recent one that has been", () => {
    const events = [
      event("older", "2026-05-01T10:00:00.000Z"),
      event("recent", "2026-06-10T10:00:00.000Z"),
    ];
    expect(pickDefaultEvent(events, now)).toBe("recent");
  });

  test("an event with no end time is ongoing only at its start", () => {
    // ends_at is nullable, so a same-instant window is the honest reading: a
    // start three hours ago with no end is over, not still running.
    expect(
      pickDefaultEvent([event("today", "2026-06-15T15:00:00.000Z")], now),
    ).toBe("today");
  });

  test("no events means no default", () => {
    expect(pickDefaultEvent([], now)).toBeNull();
  });
});

describe("buildRecordSaleInput", () => {
  test("sends ids and quantities, never prices", () => {
    const cart = setLineQuantity(addToCart([], variant()), variant().id, 2);
    const input = buildRecordSaleInput({
      cart,
      eventId: "55555555-5555-4555-8555-555555555555",
      purchaserPersonId: null,
      paymentMethod: "cash",
      discountInput: "2.50",
      notes: "  at the trailhead  ",
    });

    expect(input).toEqual({
      event_id: "55555555-5555-4555-8555-555555555555",
      purchaser_person_id: null,
      payment_method: "cash",
      discount_amount: 2.5,
      notes: "at the trailhead",
      lines: [{ variant_id: variant().id, quantity: 2 }],
    });
    // Nothing about what the cart believes the money is.
    expect(JSON.stringify(input)).not.toContain("2000");
  });

  test("a blank note is null rather than an empty string", () => {
    const input = buildRecordSaleInput({
      cart: addToCart([], variant()),
      eventId: null,
      purchaserPersonId: null,
      paymentMethod: "card",
      discountInput: "",
      notes: "   ",
    });
    expect(input.notes).toBeNull();
    expect(input.discount_amount).toBe(0);
  });
});
