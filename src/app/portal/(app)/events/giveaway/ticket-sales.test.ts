import { describe, expect, test } from "bun:test";
import { legacyGiveawayFigures, summarizeTicketSales } from "./ticket-sales";

describe("summarizeTicketSales", () => {
  test("counts sales, tickets from grants and revenue from amounts", () => {
    expect(
      summarizeTicketSales(
        [{ amount: "20.00" }, { amount: 5 }],
        [{ quantity: 10 }, { quantity: 1 }, { quantity: 2 }],
      ),
    ).toEqual({ sales: 2, ticketsSold: 13, revenue: 25 });
  });

  test("is all zeroes with nothing recorded", () => {
    expect(summarizeTicketSales([], [])).toEqual({
      sales: 0,
      ticketsSold: 0,
      revenue: 0,
    });
  });
});

describe("legacyGiveawayFigures", () => {
  test("returns the archived figures when either is non-zero", () => {
    expect(
      legacyGiveawayFigures({ tickets_sold: 142, revenue_amount: "710.00" }),
    ).toEqual({ ticketsSold: 142, revenue: 710 });
    expect(
      legacyGiveawayFigures({ tickets_sold: 0, revenue_amount: "50" }),
    ).toEqual({ ticketsSold: 0, revenue: 50 });
  });

  test("returns null for the column defaults", () => {
    expect(
      legacyGiveawayFigures({ tickets_sold: 0, revenue_amount: "0.00" }),
    ).toBeNull();
  });
});
