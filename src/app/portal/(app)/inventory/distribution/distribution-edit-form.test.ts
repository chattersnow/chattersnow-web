import { describe, expect, test } from "bun:test";
import { parseDistributionEditForm } from "./distribution-edit-form";

function makeFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("quantity", "2");
  formData.set("occurredAt", "2026-05-01T10:30");
  formData.set("reason", "Handed out at the swap");
  formData.set("recipientPersonId", "");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseDistributionEditForm", () => {
  test("parses a valid form", () => {
    const result = parseDistributionEditForm(makeFormData());
    if ("error" in result) throw new Error(result.error);
    expect(result.data.quantity).toBe(2);
    expect(result.data.occurred_at).toBe(
      new Date("2026-05-01T10:30").toISOString(),
    );
    expect(result.data.reason).toBe("Handed out at the swap");
    expect(result.data.recipient_person_id).toBeNull();
  });

  test("keeps a selected recipient and blanks out an empty reason", () => {
    const result = parseDistributionEditForm(
      makeFormData({ reason: "  ", recipientPersonId: "person-1" }),
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.data.reason).toBeNull();
    expect(result.data.recipient_person_id).toBe("person-1");
  });

  test("rejects a missing, zero, negative, or fractional quantity", () => {
    for (const quantity of ["", "0", "-1", "1.5", "abc"]) {
      expect(parseDistributionEditForm(makeFormData({ quantity }))).toEqual({
        error: "Quantity must be a whole number greater than zero.",
      });
    }
  });

  test("rejects a missing or invalid date", () => {
    expect(parseDistributionEditForm(makeFormData({ occurredAt: "" }))).toEqual(
      { error: "Date & time is required." },
    );
    expect(
      parseDistributionEditForm(makeFormData({ occurredAt: "not-a-date" })),
    ).toEqual({ error: "Enter a valid date & time." });
  });
});
