import { describe, expect, test } from "bun:test";
import { parseRevenueForm } from "./revenue-form";
import { MERCHANDISE_RETIRED_MESSAGE } from "./revenue-shared";

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
        source: "ticket_sales",
        eventId: "event-1",
        receivedDate: "2026-01-01",
        amount: "150.5",
        notes: "Door takings",
      }),
    );
    expect(result).toEqual({
      data: {
        event_id: "event-1",
        source: "ticket_sales",
        received_date: "2026-01-01",
        amount: 150.5,
        notes: "Door takings",
      },
    });
  });

  // #909: merchandise is rung up at the register, so a new revenue row may no
  // longer claim that source -- otherwise the same takings are counted twice.
  // A database trigger is the real gate; this is what makes the user see a
  // sentence rather than an error code.
  describe("the retired merchandise source", () => {
    const merchandise = () =>
      formData({
        source: "merchandise",
        receivedDate: "2026-01-01",
        amount: "20",
      });

    test("is rejected by default", () => {
      expect(parseRevenueForm(merchandise())).toEqual({
        error: MERCHANDISE_RETIRED_MESSAGE,
      });
    });

    test("is allowed when the row being edited already has it", () => {
      const result = parseRevenueForm(merchandise(), {
        allowLegacyMerchandise: true,
      });
      expect(result).toEqual({
        data: {
          event_id: null,
          source: "merchandise",
          received_date: "2026-01-01",
          amount: 20,
          notes: null,
        },
      });
    });

    test("does not exempt any other source from validation", () => {
      expect(
        parseRevenueForm(
          formData({ source: "nonsense", receivedDate: "2026-01-01" }),
          { allowLegacyMerchandise: true },
        ),
      ).toEqual({ error: "Source is required." });
    });
  });
});
