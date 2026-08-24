import { describe, expect, test } from "bun:test";
import { parseExpenseForm, parseRejectReason } from "./expense-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseExpenseForm", () => {
  test("requires a description", () => {
    expect(
      parseExpenseForm(formData({ expenseDate: "2026-01-01", amount: "10" })),
    ).toEqual({
      error: "Description is required.",
    });
  });

  test("requires an expense date", () => {
    expect(
      parseExpenseForm(formData({ description: "Tents", amount: "10" })),
    ).toEqual({
      error: "Expense date is required.",
    });
  });

  test("rejects a negative amount", () => {
    expect(
      parseExpenseForm(
        formData({
          description: "Tents",
          expenseDate: "2026-01-01",
          amount: "-1",
        }),
      ),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("defaults currency to USD", () => {
    const result = parseExpenseForm(
      formData({
        description: "Tents",
        expenseDate: "2026-01-01",
        amount: "10",
      }),
    );
    expect("data" in result && result.data.currency).toBe("USD");
  });

  test("parses valid input", () => {
    const result = parseExpenseForm(
      formData({
        description: "Tents",
        eventId: "event-1",
        expenseDate: "2026-01-01",
        amount: "150.5",
        currency: "CAD",
        receiptUrl: "https://example.com/receipt.pdf",
        notes: "Reimbursed",
      }),
    );
    expect(result).toEqual({
      data: {
        description: "Tents",
        event_id: "event-1",
        expense_date: "2026-01-01",
        amount: 150.5,
        currency: "CAD",
        receipt_url: "https://example.com/receipt.pdf",
        notes: "Reimbursed",
      },
    });
  });
});

describe("parseRejectReason", () => {
  test("requires a reason", () => {
    expect(parseRejectReason("")).toEqual({
      error: "A rejection reason is required.",
    });
  });

  test("rejects a whitespace-only reason", () => {
    expect(parseRejectReason("   ")).toEqual({
      error: "A rejection reason is required.",
    });
  });

  test("trims a valid reason", () => {
    expect(parseRejectReason("  Missing receipt  ")).toEqual({
      data: "Missing receipt",
    });
  });
});
