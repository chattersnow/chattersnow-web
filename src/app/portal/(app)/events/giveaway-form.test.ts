import { describe, expect, test } from "bun:test";
import { parseGiveawayForm, parseGiveawayPrizeForm, parseGiveawayWinnerForm } from "./giveaway-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseGiveawayForm", () => {
  test("parses valid input", () => {
    const result = parseGiveawayForm(
      formData({ name: "50/50", ticketsSold: "10", revenueAmount: "100" })
    );
    expect(result).toEqual({
      data: {
        name: "50/50",
        ticketsSold: 10,
        ticketPrice: null,
        revenueAmount: 100,
        drawingDate: null,
        notes: null,
      },
    });
  });

  test("rejects a negative tickets sold", () => {
    expect(parseGiveawayForm(formData({ ticketsSold: "-1" }))).toEqual({
      error: "Tickets sold must be a whole number of 0 or more.",
    });
  });

  test("rejects a non-integer tickets sold", () => {
    expect(parseGiveawayForm(formData({ ticketsSold: "1.5" }))).toEqual({
      error: "Tickets sold must be a whole number of 0 or more.",
    });
  });

  test("rejects a negative revenue amount", () => {
    expect(parseGiveawayForm(formData({ revenueAmount: "-5" }))).toEqual({
      error: "Revenue must be a positive number.",
    });
  });

  test("rejects a negative ticket price", () => {
    expect(parseGiveawayForm(formData({ ticketPrice: "-5" }))).toEqual({
      error: "Ticket price must be a positive number.",
    });
  });

  test("accepts a valid ticket price", () => {
    const result = parseGiveawayForm(
      formData({ name: "50/50", ticketsSold: "10", revenueAmount: "100", ticketPrice: "5" })
    );
    expect("data" in result && result.data.ticketPrice).toBe(5);
  });

  test("defaults tickets sold and revenue when omitted", () => {
    const result = parseGiveawayForm(formData({}));
    expect("data" in result && result.data.ticketsSold).toBe(0);
    expect("data" in result && result.data.revenueAmount).toBe(0);
  });
});

describe("parseGiveawayPrizeForm", () => {
  test("requires a prize name", () => {
    expect(parseGiveawayPrizeForm(formData({}))).toEqual({
      error: "Prize name is required.",
    });
  });

  test("parses valid input", () => {
    const result = parseGiveawayPrizeForm(
      formData({ prizeName: "Ski pass", donorName: "Acme", estimatedValue: "200" })
    );
    expect(result).toEqual({
      data: { prizeName: "Ski pass", donorName: "Acme", estimatedValue: 200, notes: null },
    });
  });

  test("rejects a negative estimated value", () => {
    expect(
      parseGiveawayPrizeForm(formData({ prizeName: "Ski pass", estimatedValue: "-1" }))
    ).toEqual({ error: "Estimated value must be a positive number." });
  });
});

describe("parseGiveawayWinnerForm", () => {
  test("requires a winner name", () => {
    expect(parseGiveawayWinnerForm(formData({}))).toEqual({
      error: "Winner name is required.",
    });
  });

  test("defaults distribution status to pending", () => {
    const result = parseGiveawayWinnerForm(formData({ winnerName: "Jane" }));
    expect("data" in result && result.data.distributionStatus).toBe("pending");
  });

  test("parses valid input", () => {
    const result = parseGiveawayWinnerForm(
      formData({ winnerName: "Jane", winnerContact: "jane@example.com", distributionStatus: "distributed" })
    );
    expect(result).toEqual({
      data: {
        winnerName: "Jane",
        winnerContact: "jane@example.com",
        distributionStatus: "distributed",
        distributedAt: null,
        notes: null,
      },
    });
  });
});
