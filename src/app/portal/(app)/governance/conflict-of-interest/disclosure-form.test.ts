import { describe, expect, test } from "bun:test";
import { parseDisclosureForm } from "./disclosure-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseDisclosureForm", () => {
  test("requires a disclosure year", () => {
    expect(parseDisclosureForm(formData({}))).toEqual({
      error: "Disclosure year is required.",
    });
  });

  test("rejects a non-integer disclosure year", () => {
    expect(
      parseDisclosureForm(formData({ disclosureYear: "not-a-year" })),
    ).toEqual({
      error: "Disclosure year must be a valid year.",
    });
  });

  test("rejects an out-of-range disclosure year", () => {
    expect(parseDisclosureForm(formData({ disclosureYear: "1899" }))).toEqual({
      error: "Disclosure year must be a valid year.",
    });
  });

  test("defaults on-file date and notes to null", () => {
    expect(parseDisclosureForm(formData({ disclosureYear: "2026" }))).toEqual({
      data: {
        disclosure_year: 2026,
        on_file_date: null,
        notes: null,
      },
    });
  });

  test("parses a disclosure with on-file date and notes", () => {
    expect(
      parseDisclosureForm(
        formData({
          disclosureYear: "2026",
          onFileDate: "2026-03-01",
          notes: "No conflicts to report.",
        }),
      ),
    ).toEqual({
      data: {
        disclosure_year: 2026,
        on_file_date: "2026-03-01",
        notes: "No conflicts to report.",
      },
    });
  });
});
