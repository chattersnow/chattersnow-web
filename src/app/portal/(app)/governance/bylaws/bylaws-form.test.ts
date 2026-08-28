import { describe, expect, test } from "bun:test";
import { parseBylawsForm } from "./bylaws-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseBylawsForm", () => {
  test("requires a version", () => {
    expect(parseBylawsForm(formData({ effectiveDate: "2026-01-01" }))).toEqual({
      error: "Version is required.",
    });
  });

  test("requires an effective date", () => {
    expect(parseBylawsForm(formData({ version: "Original" }))).toEqual({
      error: "Effective date is required.",
    });
  });

  test("defaults amendment summary to null", () => {
    expect(
      parseBylawsForm(
        formData({ version: "Original", effectiveDate: "2026-01-01" }),
      ),
    ).toEqual({
      data: {
        version: "Original",
        effective_date: "2026-01-01",
        amendment_summary: null,
      },
    });
  });

  test("parses an amendment with a summary", () => {
    expect(
      parseBylawsForm(
        formData({
          version: "Amendment 1",
          effectiveDate: "2026-06-01",
          amendmentSummary: "Updated quorum requirements",
        }),
      ),
    ).toEqual({
      data: {
        version: "Amendment 1",
        effective_date: "2026-06-01",
        amendment_summary: "Updated quorum requirements",
      },
    });
  });
});
