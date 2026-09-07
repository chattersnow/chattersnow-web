import { describe, expect, test } from "bun:test";
import {
  ANONYMOUS_DONOR_LABEL,
  donorLabel,
  isPaymentMethod,
  paymentMethodLabel,
  type MonetaryDonationRow,
} from "./donations-shared";

function row(overrides: Partial<MonetaryDonationRow>): MonetaryDonationRow {
  return {
    id: "d1",
    donor_id: "p1",
    event_id: null,
    amount: 25,
    method: "cash",
    received_date: "2026-08-15",
    notes: null,
    people: { name: "Jamie Rivera" },
    events: null,
    ...overrides,
  };
}

describe("isPaymentMethod", () => {
  test("accepts known methods and rejects everything else", () => {
    expect(isPaymentMethod("bank_transfer")).toBe(true);
    expect(isPaymentMethod("barter")).toBe(false);
    expect(isPaymentMethod("")).toBe(false);
    expect(isPaymentMethod(undefined)).toBe(false);
  });
});

describe("paymentMethodLabel", () => {
  test("humanizes the enum value", () => {
    expect(paymentMethodLabel("bank_transfer")).toBe("Bank transfer");
  });
});

describe("donorLabel", () => {
  test("uses the linked person's name", () => {
    expect(donorLabel(row({}))).toBe("Jamie Rivera");
  });

  test("labels a donation with no donor as anonymous", () => {
    expect(donorLabel(row({ donor_id: null, people: null }))).toBe(
      ANONYMOUS_DONOR_LABEL,
    );
  });

  test("falls back to a dash when the linked person has no name", () => {
    expect(donorLabel(row({ people: { name: "  " } }))).toBe("—");
    expect(donorLabel(row({ people: null }))).toBe("—");
  });
});
