import { describe, expect, test } from "bun:test";
import {
  ANONYMOUS_DONOR_LABEL,
  donationSourceLabel,
  donorLabel,
  isDonationSource,
  isImportedDonation,
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
    source: "manual",
    external_reference: null,
    processor_label: null,
    gross_amount: null,
    fee_amount: null,
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

describe("donation provenance (#1390)", () => {
  test("isDonationSource accepts the three the constraint allows", () => {
    expect(isDonationSource("manual")).toBe(true);
    expect(isDonationSource("import")).toBe(true);
    expect(isDonationSource("processor")).toBe(true);
    expect(isDonationSource("csv")).toBe(false);
    expect(isDonationSource(undefined)).toBe(false);
  });

  test("donationSourceLabel says where a row came from in plain words", () => {
    expect(donationSourceLabel("manual")).toBe("Entered here");
    expect(donationSourceLabel("import")).toBe("Imported");
  });

  test("a typed gift is editable and anything else is not", () => {
    expect(isImportedDonation(row({}))).toBe(false);
    expect(isImportedDonation(row({ source: "import" }))).toBe(true);
    // Reserved for a live integration, and read-only for the same reason an
    // imported row is: its figures came from somewhere else.
    expect(isImportedDonation(row({ source: "processor" }))).toBe(true);
  });
});
