import { describe, expect, test } from "bun:test";
import {
  needsConsentGate,
  needsSensitiveReviewGate,
  parseContentPermissionForm,
} from "./content-permission-shared";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  permittedUse: "Social media and website spotlight, 2027 season.",
  consentOnFileAt: "2027-01-15",
};

describe("parseContentPermissionForm", () => {
  test("parses valid input", () => {
    const result = parseContentPermissionForm(formData(validFields));
    expect("data" in result && result.data.permittedUse).toBe(
      "Social media and website spotlight, 2027 season.",
    );
    expect("data" in result && result.data.usageLimits).toBeNull();
  });

  test("requires permitted use", () => {
    expect(
      parseContentPermissionForm(
        formData({ ...validFields, permittedUse: "" }),
      ),
    ).toEqual({ error: "Describe the permitted use before saving consent." });
  });

  test("requires the on-file date", () => {
    expect(
      parseContentPermissionForm(
        formData({ ...validFields, consentOnFileAt: "" }),
      ),
    ).toEqual({ error: "The date consent was recorded is required." });
  });

  test("trims usage limits and keeps null when blank", () => {
    const result = parseContentPermissionForm(
      formData({
        ...validFields,
        usageLimits: "  Social only, no last names.  ",
      }),
    );
    expect("data" in result && result.data.usageLimits).toBe(
      "Social only, no last names.",
    );
  });
});

describe("needsConsentGate", () => {
  test("gates approved, scheduled, and published", () => {
    expect(needsConsentGate("approved")).toBe(true);
    expect(needsConsentGate("scheduled")).toBe(true);
    expect(needsConsentGate("published")).toBe(true);
  });

  test("does not gate earlier statuses", () => {
    expect(needsConsentGate("not_planned")).toBe(false);
    expect(needsConsentGate("draft")).toBe(false);
    expect(needsConsentGate("in_review")).toBe(false);
    expect(needsConsentGate("skipped")).toBe(false);
  });
});

describe("needsSensitiveReviewGate", () => {
  test("blocks a gated status on a flagged, unreviewed item", () => {
    expect(needsSensitiveReviewGate("approved", true, null)).toBe(true);
  });

  test("allows a gated status once reviewed", () => {
    expect(
      needsSensitiveReviewGate(
        "approved",
        true,
        "11111111-1111-1111-1111-111111111111",
      ),
    ).toBe(false);
  });

  test("allows an unflagged item regardless of review state", () => {
    expect(needsSensitiveReviewGate("approved", false, null)).toBe(false);
  });

  test("does not gate earlier statuses even when unreviewed", () => {
    expect(needsSensitiveReviewGate("draft", true, null)).toBe(false);
  });
});
