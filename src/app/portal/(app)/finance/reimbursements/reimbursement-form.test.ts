import { describe, expect, test } from "bun:test";
import {
  parseReimbursementForm,
  parseRejectReason,
} from "./reimbursement-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  personId: "person-1",
  eventId: "event-1",
  description: "  Gas to the mountain  ",
  amount: "42.50",
  currency: "CAD",
  receiptUrl: "https://example.com/receipt.pdf",
  notes: "  Split with a second driver.  ",
};

describe("parseReimbursementForm", () => {
  test("parses a fully filled form", () => {
    expect(parseReimbursementForm(formData(validFields))).toEqual({
      data: {
        person_id: "person-1",
        event_id: "event-1",
        description: "Gas to the mountain",
        amount: 42.5,
        currency: "CAD",
        receipt_url: "https://example.com/receipt.pdf",
        notes: "Split with a second driver.",
      },
    });
  });

  test("turns blank optional fields into null", () => {
    const result = parseReimbursementForm(
      formData({ ...validFields, eventId: "", receiptUrl: "", notes: "   " }),
    );
    expect("data" in result && result.data).toMatchObject({
      event_id: null,
      receipt_url: null,
      notes: null,
    });
  });

  test("defaults the currency to USD when absent or blank", () => {
    const absent = formData(validFields);
    absent.delete("currency");
    const parsedAbsent = parseReimbursementForm(absent);
    expect("data" in parsedAbsent && parsedAbsent.data.currency).toBe("USD");

    const blank = parseReimbursementForm(
      formData({ ...validFields, currency: "   " }),
    );
    expect("data" in blank && blank.data.currency).toBe("USD");
  });

  test("requires a person", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, personId: "  " })),
    ).toEqual({ error: "Select who is requesting reimbursement." });
  });

  test("requires a description", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, description: "  " })),
    ).toEqual({ error: "Description is required." });
  });

  test("rejects a blank amount rather than reading it as zero", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, amount: "   " })),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("rejects a non-numeric amount", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, amount: "forty" })),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("rejects a negative amount", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, amount: "-1" })),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("rejects an infinite amount", () => {
    expect(
      parseReimbursementForm(formData({ ...validFields, amount: "Infinity" })),
    ).toEqual({ error: "Amount must be a positive number." });
  });

  test("accepts a zero amount", () => {
    const result = parseReimbursementForm(
      formData({ ...validFields, amount: "0" }),
    );
    expect("data" in result && result.data.amount).toBe(0);
  });
});

describe("parseRejectReason", () => {
  test("trims the reason", () => {
    expect(parseRejectReason("  Missing receipt.  ")).toEqual({
      data: "Missing receipt.",
    });
  });

  test("rejects a whitespace-only reason", () => {
    expect(parseRejectReason("   ")).toEqual({
      error: "A rejection reason is required.",
    });
  });

  test("rejects an empty reason", () => {
    expect(parseRejectReason("")).toEqual({
      error: "A rejection reason is required.",
    });
  });
});
