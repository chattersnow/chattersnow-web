import { describe, expect, test } from "bun:test";
import { parseRecordSaleInput, parseSaleEditForm } from "./sale-form";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";

function input(overrides: Record<string, unknown> = {}) {
  return {
    event_id: null,
    purchaser_person_id: null,
    payment_method: "cash",
    discount_amount: 0,
    notes: null,
    lines: [{ variant_id: VARIANT, quantity: 1 }],
    ...overrides,
  };
}

function ok<T>(result: { data: T } | { error: string }): T {
  if ("error" in result) throw new Error(`expected data, got: ${result.error}`);
  return result.data;
}

describe("parseRecordSaleInput", () => {
  test("accepts the register's payload", () => {
    expect(
      ok(
        parseRecordSaleInput(
          input({
            event_id: EVENT,
            purchaser_person_id: PERSON,
            discount_amount: "2.5",
            notes: "  cash box  ",
            lines: [{ variant_id: VARIANT, quantity: 3 }],
          }),
        ),
      ),
    ).toEqual({
      event_id: EVENT,
      purchaser_person_id: PERSON,
      payment_method: "cash",
      discount_amount: 2.5,
      tax_rate: 0,
      notes: "cash box",
      lines: [{ variant_id: VARIANT, quantity: 3 }],
    });
  });

  test("accepts a tax rate as a number or a numeric string", () => {
    expect(ok(parseRecordSaleInput(input({ tax_rate: 8.25 }))).tax_rate).toBe(
      8.25,
    );
    expect(ok(parseRecordSaleInput(input({ tax_rate: "7" }))).tax_rate).toBe(7);
    expect(ok(parseRecordSaleInput(input({ tax_rate: 100 }))).tax_rate).toBe(
      100,
    );
  });

  test("a missing tax rate is zero", () => {
    for (const taxRate of [undefined, null, ""]) {
      expect(
        ok(parseRecordSaleInput(input({ tax_rate: taxRate }))).tax_rate,
      ).toBe(0);
    }
  });

  test("refuses a negative, over-100 or unreadable tax rate", () => {
    for (const taxRate of [-1, "-0.5", 100.001, "abc", Infinity]) {
      expect(parseRecordSaleInput(input({ tax_rate: taxRate }))).toEqual({
        error: "Tax rate must be between 0 and 100 percent.",
      });
    }
  });

  test("rounds a tax rate to three decimals", () => {
    // numeric(6,3) on sales.tax_rate; rounding here keeps the register's
    // figure and the stored one identical.
    expect(ok(parseRecordSaleInput(input({ tax_rate: 8.3756 }))).tax_rate).toBe(
      8.376,
    );
  });

  test("an absent event or purchaser is null, not an error", () => {
    const parsed = ok(
      parseRecordSaleInput(
        input({ event_id: "", purchaser_person_id: undefined }),
      ),
    );
    expect(parsed.event_id).toBeNull();
    expect(parsed.purchaser_person_id).toBeNull();
  });

  // A Server Action's arguments are a public API: nothing stops a hand-rolled
  // POST, so every one of these is a real shape the parser has to refuse.
  test("refuses a payload that is not an object", () => {
    for (const bad of [null, undefined, "sale", 7, true]) {
      expect(parseRecordSaleInput(bad)).toHaveProperty("error");
    }
  });

  test("refuses an id that is not a uuid", () => {
    expect(parseRecordSaleInput(input({ event_id: "event-1" }))).toEqual({
      error: "Choose a valid event.",
    });
    expect(parseRecordSaleInput(input({ purchaser_person_id: "me" }))).toEqual({
      error: "Choose a valid purchaser.",
    });
  });

  test("refuses an unknown payment method", () => {
    for (const method of ["venmo", "", undefined, 3]) {
      expect(parseRecordSaleInput(input({ payment_method: method }))).toEqual({
        error: "Choose how the sale was paid.",
      });
    }
  });

  test("refuses a negative or unreadable discount", () => {
    for (const discount of ["-1", -0.5, "abc"]) {
      expect(
        parseRecordSaleInput(input({ discount_amount: discount })),
      ).toEqual({ error: "Discount must be zero or more." });
    }
  });

  test("a missing discount is zero", () => {
    expect(
      ok(parseRecordSaleInput(input({ discount_amount: undefined })))
        .discount_amount,
    ).toBe(0);
  });

  test("refuses an empty or absent line list", () => {
    for (const lines of [[], undefined, null, "one"]) {
      expect(parseRecordSaleInput(input({ lines }))).toEqual({
        error: "Add at least one item before recording the sale.",
      });
    }
  });

  test("refuses a line whose variant id is not one", () => {
    for (const line of [{ variant_id: "x", quantity: 1 }, 5]) {
      expect(parseRecordSaleInput(input({ lines: [line] }))).toEqual({
        error: "Every line needs a product and a quantity.",
      });
    }
  });

  test("a catalog line may carry a price, rounded to cents", () => {
    const parsed = ok(
      parseRecordSaleInput(
        input({
          lines: [{ variant_id: VARIANT, quantity: 2, unit_price: 5.005 }],
        }),
      ),
    );
    expect(parsed.lines).toEqual([
      { variant_id: VARIANT, quantity: 2, unit_price: 5.01 },
    ]);
  });

  test("a catalog line without a price sends none, as it always has", () => {
    const parsed = ok(
      parseRecordSaleInput(
        input({ lines: [{ variant_id: VARIANT, quantity: 1 }] }),
      ),
    );
    expect(parsed.lines).toEqual([{ variant_id: VARIANT, quantity: 1 }]);
    expect("unit_price" in parsed.lines[0]).toBe(false);
  });

  test("refuses a catalog line that brings its own description", () => {
    // The description of a catalog line is composed by the RPC from the product
    // and the variant, so one arriving here is the wrong shape, not extra data.
    expect(
      parseRecordSaleInput(
        input({
          lines: [
            { variant_id: VARIANT, quantity: 1, description: "Smuggled" },
          ],
        }),
      ),
    ).toEqual({ error: "Every line needs a product and a quantity." });
  });

  test("a custom line carries its own description and price", () => {
    const parsed = ok(
      parseRecordSaleInput(
        input({
          lines: [
            { description: "  Donated print  ", unit_price: 3.5, quantity: 2 },
          ],
        }),
      ),
    );
    expect(parsed.lines).toEqual([
      { description: "Donated print", unit_price: 3.5, quantity: 2 },
    ]);
  });

  test("refuses a custom line with no description, a blank one, or an over-long one", () => {
    for (const description of [undefined, "", "   ", "x".repeat(121)]) {
      const result = parseRecordSaleInput(
        input({ lines: [{ description, unit_price: 1, quantity: 1 }] }),
      );
      expect("error" in result).toBe(true);
    }
  });

  test("refuses a custom line with no price", () => {
    expect(
      parseRecordSaleInput(
        input({ lines: [{ description: "Coffee", quantity: 1 }] }),
      ),
    ).toEqual({ error: "A custom item needs a price." });
  });

  test("refuses a price that is negative, unreadable or beyond numeric(10,2)", () => {
    for (const unitPrice of [-1, "3", Number.NaN, Infinity, 100000000]) {
      expect(
        parseRecordSaleInput(
          input({
            lines: [
              { variant_id: VARIANT, quantity: 1, unit_price: unitPrice },
            ],
          }),
        ),
      ).toEqual({ error: "A price must be a number of zero or more." });
    }
  });

  test("refuses a quantity that is not a whole number of one or more", () => {
    for (const quantity of [0, -1, 1.5, "2", null]) {
      expect(
        parseRecordSaleInput(
          input({ lines: [{ variant_id: VARIANT, quantity }] }),
        ),
      ).toEqual({
        error: "Every quantity must be a whole number of one or more.",
      });
    }
  });

  test("rounds a discount to cents", () => {
    // numeric(10,2) would round it in the database anyway; doing it here means
    // the figure the register shows and the one Postgres stores are the same.
    expect(
      ok(parseRecordSaleInput(input({ discount_amount: 1.239 })))
        .discount_amount,
    ).toBe(1.24);
    expect(
      ok(parseRecordSaleInput(input({ discount_amount: "2.001" })))
        .discount_amount,
    ).toBe(2);
  });
});

describe("parseSaleEditForm", () => {
  function form(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    return fd;
  }

  test("keeps the three editable fields and nothing else", () => {
    expect(
      ok(
        parseSaleEditForm(
          form({
            eventId: EVENT,
            purchaserPersonId: PERSON,
            notes: " corrected ",
            // Money is the RPC's business; a posted total must not survive.
            total: "999",
          }),
        ),
      ),
    ).toEqual({
      event_id: EVENT,
      purchaser_person_id: PERSON,
      notes: "corrected",
    });
  });

  test("blank event, purchaser and note become null", () => {
    expect(
      ok(
        parseSaleEditForm(
          form({ eventId: "", purchaserPersonId: "", notes: "" }),
        ),
      ),
    ).toEqual({ event_id: null, purchaser_person_id: null, notes: null });
  });

  test("refuses an id that is not a uuid", () => {
    expect(parseSaleEditForm(form({ eventId: "nope" }))).toEqual({
      error: "Choose a valid event.",
    });
  });
});
