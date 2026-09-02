import { describe, expect, test } from "bun:test";
import { parseDonationEditForm } from "./donation-edit-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("parseDonationEditForm", () => {
  test("requires a date received", () => {
    const result = parseDonationEditForm(formData({ donatedAt: "" }));
    expect(result).toEqual({ error: "Date received is required." });
  });

  test("rejects an unparseable date", () => {
    const result = parseDonationEditForm(formData({ donatedAt: "not-a-date" }));
    expect(result).toEqual({ error: "Enter a valid date received." });
  });

  test("parses a valid date and trims notes", () => {
    const result = parseDonationEditForm(
      formData({ donatedAt: "2026-05-01", notes: "  Dropped off at HQ  " }),
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.donated_at).toBe(new Date("2026-05-01").toISOString());
      expect(result.data.notes).toBe("Dropped off at HQ");
    }
  });

  test("maps blank notes to null", () => {
    const result = parseDonationEditForm(
      formData({ donatedAt: "2026-05-01", notes: "   " }),
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.notes).toBeNull();
    }
  });
});
