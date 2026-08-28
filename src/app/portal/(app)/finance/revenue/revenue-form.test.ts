import { describe, expect, test } from "bun:test";
import { parseRevenueForm } from "./revenue-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseRevenueForm", () => {
  test("requires a source", () => {
    expect(
      parseRevenueForm(formData({ receivedDate: "2026-01-01", amount: "10" })),
    ).toEqual({
      error: "Source is required.",
    });
  });

  test("rejects an invalid source", () => {
    expect(
      parseRevenueForm(
        formData({
          source: "sponsorship",
          receivedDate: "2026-01-01",
          amount: "10",
        }),
      ),
    ).toEqual({ error: "Source is required." });
  });

  test("requires a received date", () => {
    expect(
      parseRevenueForm(formData({ source: "ticket_sales", amount: "10" })),
    ).toEqual({
      error: "Date is required.",
    });
  });

  test("rejects a negative amount", () => {
    expect(
      parseRevenueForm(
        formData({
          source: "ticket_sales",
          receivedDate: "2026-01-01",
          amount: "-1",
        }),
      ),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("parses valid input", () => {
    const result = parseRevenueForm(
      formData({
        source: "merchandise",
        eventId: "event-1",
        receivedDate: "2026-01-01",
        amount: "150.5",
        notes: "T-shirt table",
      }),
    );
    expect(result).toEqual({
      data: {
        event_id: "event-1",
        source: "merchandise",
        received_date: "2026-01-01",
        amount: 150.5,
        notes: "T-shirt table",
      },
    });
  });
});
