import { describe, expect, test } from "bun:test";
import { parsePolicyForm } from "./policy-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parsePolicyForm", () => {
  test("requires a name", () => {
    expect(
      parsePolicyForm(formData({ effectiveDate: "2026-01-01", version: "1" })),
    ).toEqual({
      error: "Policy name is required.",
    });
  });

  test("requires an effective date", () => {
    expect(
      parsePolicyForm(formData({ name: "Whistleblower Policy", version: "1" })),
    ).toEqual({
      error: "Effective date is required.",
    });
  });

  test("requires a version", () => {
    expect(
      parsePolicyForm(
        formData({ name: "Whistleblower Policy", effectiveDate: "2026-01-01" }),
      ),
    ).toEqual({
      error: "Version is required.",
    });
  });

  test("defaults category to null", () => {
    expect(
      parsePolicyForm(
        formData({
          name: "Whistleblower Policy",
          effectiveDate: "2026-01-01",
          version: "1",
        }),
      ),
    ).toEqual({
      data: {
        name: "Whistleblower Policy",
        category: null,
        effective_date: "2026-01-01",
        version: "1",
      },
    });
  });

  test("parses a policy with a category", () => {
    expect(
      parsePolicyForm(
        formData({
          name: "Document Retention Policy",
          category: "Records management",
          effectiveDate: "2026-03-01",
          version: "2",
        }),
      ),
    ).toEqual({
      data: {
        name: "Document Retention Policy",
        category: "Records management",
        effective_date: "2026-03-01",
        version: "2",
      },
    });
  });
});
