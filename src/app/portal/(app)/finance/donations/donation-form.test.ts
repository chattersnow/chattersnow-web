import { describe, expect, test } from "bun:test";
import { parseDonationForm } from "./donation-form";
import { PAYMENT_METHODS } from "./donations-shared";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  donorId: "person-1",
  eventId: "event-1",
  method: "cash",
  receivedDate: "2026-08-15",
  amount: "25.50",
  notes: "  Dropped off at the office.  ",
};

describe("parseDonationForm", () => {
  test("parses a fully filled form", () => {
    const result = parseDonationForm(formData(validFields));
    expect(result).toEqual({
      data: {
        donor_id: "person-1",
        event_id: "event-1",
        method: "cash",
        received_date: "2026-08-15",
        amount: 25.5,
        notes: "Dropped off at the office.",
      },
    });
  });

  test("turns a blank donor into null (anonymous donation)", () => {
    const result = parseDonationForm(formData({ ...validFields, donorId: "" }));
    expect("data" in result && result.data.donor_id).toBeNull();
  });

  test("turns a blank event into null", () => {
    const result = parseDonationForm(formData({ ...validFields, eventId: "" }));
    expect("data" in result && result.data.event_id).toBeNull();
  });

  test("turns blank notes into null", () => {
    const result = parseDonationForm(formData({ ...validFields, notes: "  " }));
    expect("data" in result && result.data.notes).toBeNull();
  });

  test("rejects a missing payment method", () => {
    const result = parseDonationForm(formData({ ...validFields, method: "" }));
    expect(result).toEqual({ error: "Payment method is required." });
  });

  test("rejects an unknown payment method", () => {
    const result = parseDonationForm(
      formData({ ...validFields, method: "barter" }),
    );
    expect(result).toEqual({ error: "Payment method is required." });
  });

  test("rejects a missing date", () => {
    const result = parseDonationForm(
      formData({ ...validFields, receivedDate: "" }),
    );
    expect(result).toEqual({ error: "Date is required." });
  });

  test("rejects a blank amount", () => {
    const result = parseDonationForm(formData({ ...validFields, amount: "" }));
    expect(result).toEqual({ error: "Amount must be a positive number." });
  });

  test("rejects a non-numeric amount", () => {
    const result = parseDonationForm(
      formData({ ...validFields, amount: "abc" }),
    );
    expect(result).toEqual({ error: "Amount must be a positive number." });
  });

  test("rejects a negative amount", () => {
    const result = parseDonationForm(
      formData({ ...validFields, amount: "-5" }),
    );
    expect(result).toEqual({ error: "Amount must be a positive number." });
  });

  test("accepts an amount of zero", () => {
    const result = parseDonationForm(formData({ ...validFields, amount: "0" }));
    expect("data" in result && result.data.amount).toBe(0);
  });

  for (const method of PAYMENT_METHODS) {
    test(`accepts the ${method} payment method`, () => {
      const result = parseDonationForm(formData({ ...validFields, method }));
      expect("data" in result && result.data.method).toBe(method);
    });
  }
});
