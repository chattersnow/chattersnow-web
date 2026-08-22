import { describe, expect, test } from "bun:test";
import { formatAmount, formatExpenseDate } from "./expenses-shared";

describe("formatAmount", () => {
  test("formats a numeric amount as currency", () => {
    expect(formatAmount(150.5, "USD")).toBe("$150.50");
  });

  test("formats a string amount as currency", () => {
    expect(formatAmount("150.5", "USD")).toBe("$150.50");
  });

  test("returns an em dash for a non-numeric string", () => {
    expect(formatAmount("not-a-number", "USD")).toBe("—");
  });

  test("falls back to a plain string for an unknown currency code", () => {
    expect(formatAmount(10, "NOTACODE")).toBe("NOTACODE 10.00");
  });
});

describe("formatExpenseDate", () => {
  test("formats a date-only string without a timezone shift", () => {
    expect(formatExpenseDate("2026-03-15")).toBe("Mar 15, 2026");
  });
});
