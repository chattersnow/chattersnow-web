import { pinTimezone } from "../../../../../../test/timezone";
import { describe, expect, test } from "bun:test";
import {
  buildReceipt,
  formatReceiptInstant,
  formatReceiptNumber,
  receiptAsPlainText,
} from "./receipt";
import type { SaleRow } from "./sales-shared";

// Pinned to a zone that is neither the org's nor the fixture's, the way
// event-date-defaults.dom.test.tsx has since #1062: a receipt formatted in the
// running process's zone is the defect this file guards (#1076), and on a
// machine that happened to sit in the org's zone the assertions would pass for
// exactly the wrong reason.
pinTimezone("Australia/Sydney");

const ORG = { name: "Example Nonprofit", logoUrl: null };

/**
 * The organization's zone. Seven hours behind the fixture's instants and a day
 * apart from the pinned process zone, so a 5pm-UTC sale reads as the same
 * morning in Denver, the previous evening had it been formatted in UTC, and
 * the following morning in Sydney -- three visibly different answers.
 */
const ZONE = "America/Denver";

/**
 * Every money column arrives from PostgREST as a string, which is what the
 * coercion assertions below are about: a receipt that printed "$NaN" would do
 * so only against the real database.
 */
function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    id: "dcdcdcdc-0000-4000-8000-000000000001",
    receipt_number: 123,
    event_id: "cccccccc-0000-4000-8000-000000000002",
    purchaser_person_id: "bbbbbbbb-0000-4000-8000-000000000001",
    sold_at: "2026-06-01T17:00:00.000Z",
    payment_method: "cash",
    subtotal: "65.00",
    discount_amount: "5.00",
    tax_rate: "8.250",
    tax_amount: "4.95",
    total: "64.95",
    status: "completed",
    voided_at: null,
    void_reason: null,
    notes: "Merch table, paid in cash.",
    events: { name: "Fall Trailhead Cleanup" },
    purchaser: {
      id: "bbbbbbbb-0000-4000-8000-000000000001",
      name: "Jamie Rivera",
      preferred_name: null,
    },
    sale_line_items: [
      {
        id: "line-1",
        product_variant_id: "cdcdcdcd-0000-4000-8000-000000001001",
        description: "Chatter Snow Beanie — One size",
        unit_price: "20.00",
        list_price: "20.00",
        quantity: 2,
        line_total: "40.00",
      },
      {
        id: "line-2",
        product_variant_id: null,
        description: "Donated print",
        unit_price: "25.00",
        list_price: null,
        quantity: 1,
        line_total: "25.00",
      },
    ],
    ...overrides,
  };
}

describe("formatReceiptNumber", () => {
  test("pads to six digits behind a hash", () => {
    expect(formatReceiptNumber(1)).toBe("#000001");
    expect(formatReceiptNumber(123)).toBe("#000123");
    expect(formatReceiptNumber(999999)).toBe("#999999");
  });

  test("a tenant past a million sales simply gets a seventh digit", () => {
    expect(formatReceiptNumber(1000000)).toBe("#1000000");
  });
});

describe("buildReceipt", () => {
  test("maps the lines, in order, with figures already formatted", () => {
    expect(buildReceipt(sale(), ORG, ZONE).lines).toEqual([
      {
        id: "line-1",
        description: "Chatter Snow Beanie — One size",
        quantity: 2,
        unitPrice: "$20.00",
        lineTotal: "$40.00",
      },
      {
        id: "line-2",
        description: "Donated print",
        quantity: 1,
        unitPrice: "$25.00",
        lineTotal: "$25.00",
      },
    ]);
  });

  test("totals carry the tax rate the sale was rung at", () => {
    const model = buildReceipt(sale(), ORG, ZONE);
    expect(model.totals).toEqual([
      { label: "Subtotal", value: "$65.00" },
      { label: "Discount", value: "−$5.00" },
      { label: "Tax (8.25%)", value: "$4.95" },
    ]);
    expect(model.total).toBe("$64.95");
  });

  test("a sale with no discount and no tax shows neither row", () => {
    const model = buildReceipt(
      sale({
        subtotal: "20.00",
        discount_amount: "0.00",
        tax_rate: "0.000",
        tax_amount: "0.00",
        total: "20.00",
      }),
      ORG,
      ZONE,
    );
    expect(model.totals).toEqual([{ label: "Subtotal", value: "$20.00" }]);
  });

  test("the purchaser's name is on it and nothing else about them", () => {
    const model = buildReceipt(sale(), ORG, ZONE);
    expect(model.purchaserName).toBe("Jamie Rivera");
    // The one thing this asserts is an absence, so it asserts it over the
    // whole model rather than over the fields it expects to be wrong.
    expect(JSON.stringify(model)).not.toContain("@");
  });

  test("an anonymous sale has no purchaser line at all", () => {
    expect(
      buildReceipt(
        sale({ purchaser: null, purchaser_person_id: null }),
        ORG,
        ZONE,
      ).purchaserName,
    ).toBeNull();
  });

  test("the internal note never reaches the receipt", () => {
    expect(JSON.stringify(buildReceipt(sale(), ORG, ZONE))).not.toContain(
      "Merch table",
    );
  });

  test("a voided sale carries the date it was voided", () => {
    const voided = buildReceipt(
      sale({ status: "voided", voided_at: "2026-06-02T17:00:00.000Z" }),
      ORG,
      ZONE,
    );
    expect(voided.voidedAt).toBe("2026-06-02T17:00:00.000Z");
    expect(buildReceipt(sale(), ORG, ZONE).voidedAt).toBeNull();
  });

  test("carries the instants unformatted, with the zone to read them in", () => {
    const model = buildReceipt(sale(), ORG, ZONE);
    expect(model.soldAt).toBe("2026-06-01T17:00:00.000Z");
    expect(model.timeZone).toBe(ZONE);
  });

  test("numeric columns that arrive as numbers coerce the same way", () => {
    const asNumbers = buildReceipt(
      sale({
        subtotal: 65,
        discount_amount: 5,
        tax_rate: 8.25,
        tax_amount: 4.95,
        total: 64.95,
      }),
      ORG,
      ZONE,
    );
    expect(asNumbers.totals).toEqual(buildReceipt(sale(), ORG, ZONE).totals);
    expect(asNumbers.total).toBe("$64.95");
  });
});

describe("receiptAsPlainText", () => {
  test("is stable, and reads as a receipt", () => {
    const text = receiptAsPlainText(buildReceipt(sale(), ORG, ZONE));
    expect(text.split("\n")).toEqual([
      "Example Nonprofit",
      "Receipt #000123",
      // Derived rather than written out, so the clipboard text is asserted to
      // agree with the rendered receipt rather than with a second literal that
      // could drift from it. What it resolves to is pinned in
      // `formatReceiptInstant`'s own tests below.
      formatReceiptInstant("2026-06-01T17:00:00.000Z", ZONE),
      "Fall Trailhead Cleanup",
      "",
      "2 × Chatter Snow Beanie — One size @ $20.00 — $40.00",
      "1 × Donated print @ $25.00 — $25.00",
      "",
      "Subtotal: $65.00",
      "Discount: −$5.00",
      "Tax (8.25%): $4.95",
      "Total: $64.95",
      "Paid by Cash",
      "Purchaser: Jamie Rivera",
    ]);
  });

  test("a voided sale says so on its second line, where it cannot be missed", () => {
    const text = receiptAsPlainText(
      buildReceipt(
        sale({ status: "voided", voided_at: "2026-06-02T17:00:00.000Z" }),
        ORG,
        ZONE,
      ),
    );
    expect(text.split("\n")[2]).toStartWith("VOIDED ");
  });
});

/**
 * Asserted in parts rather than against one literal: the separator Intl puts
 * between the date and the time ("," or " at ") moves with the ICU version the
 * runner was built against, and a test that fails when Bun is upgraded teaches
 * nobody anything. The day, the clock time and the zone name are what this
 * ticket is about, and all three are pinned.
 */
function expectReadsAs(formatted: string, day: string, time: string) {
  expect(formatted).toContain(day);
  expect(formatted).toContain(time);
}

describe("formatReceiptInstant", () => {
  test("reads the instant in the given zone and names it", () => {
    expectReadsAs(
      formatReceiptInstant("2026-06-01T17:00:00.000Z", ZONE),
      "Jun 1, 2026",
      "11:00 AM MDT",
    );
  });

  test("a sale rung up in the evening does not print the next day", () => {
    // The defect #1076 names: 7pm on 28 February in Denver is stored as
    // 2026-03-01T02:00Z, and a receipt formatted in the server's zone printed
    // it as 2:00 AM on 1 March -- the wrong day, the wrong month, and with
    // nothing on the line to say so.
    expectReadsAs(
      formatReceiptInstant("2026-03-01T02:00:00.000Z", ZONE),
      "Feb 28, 2026",
      "7:00 PM MST",
    );
  });

  test("the same instant in another zone is a different receipt line", () => {
    expectReadsAs(
      formatReceiptInstant("2026-03-01T02:00:00.000Z", "UTC"),
      "Mar 1, 2026",
      "2:00 AM UTC",
    );
  });
});
