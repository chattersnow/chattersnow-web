import { describe, expect, test } from "bun:test";
import {
  parseGiveawayForm,
  parseGiveawayPrizeForm,
  parseGiveawayWinnerForm,
} from "./giveaway-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseGiveawayForm", () => {
  test("parses valid input", () => {
    const result = parseGiveawayForm(
      formData({ name: "50/50", drawingDate: "2026-12-01", notes: " Cash " }),
    );
    expect(result).toEqual({
      data: { name: "50/50", drawingDate: "2026-12-01", notes: "Cash" },
    });
  });

  test("ignores the retired hand-entered sales figures (#1577)", () => {
    const result = parseGiveawayForm(
      formData({ ticketsSold: "-1", ticketPrice: "x", revenueAmount: "-5" }),
    );
    expect(result).toEqual({
      data: { name: null, drawingDate: null, notes: null },
    });
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
      formData({ prizeName: "Ski pass", estimatedValue: "200" }),
    );
    expect(result).toEqual({
      data: { prizeName: "Ski pass", estimatedValue: 200, notes: null },
    });
  });

  test("rejects a negative estimated value", () => {
    expect(
      parseGiveawayPrizeForm(
        formData({ prizeName: "Ski pass", estimatedValue: "-1" }),
      ),
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
      formData({
        winnerName: "Jane",
        winnerContact: "jane@example.com",
        distributionStatus: "distributed",
      }),
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
