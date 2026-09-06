import { describe, expect, test } from "bun:test";
import { parseChecklistItemForm } from "./checklist-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("parseChecklistItemForm", () => {
  test("trims the title", () => {
    expect(
      parseChecklistItemForm(formData({ title: "  Load the trailer  " })),
    ).toEqual({ data: { title: "Load the trailer" } });
  });

  test("requires a title", () => {
    expect(parseChecklistItemForm(new FormData())).toEqual({
      error: "A title is required.",
    });
  });

  test("rejects a whitespace-only title", () => {
    expect(parseChecklistItemForm(formData({ title: "   " }))).toEqual({
      error: "A title is required.",
    });
  });

  test("accepts a title of exactly 200 characters but not 201", () => {
    const atLimit = parseChecklistItemForm(
      formData({ title: "a".repeat(200) }),
    );
    expect("data" in atLimit).toBe(true);

    expect(
      parseChecklistItemForm(formData({ title: "a".repeat(201) })),
    ).toEqual({ error: "Keep the title under 200 characters." });
  });

  test("measures length after trimming, so padding alone cannot overflow", () => {
    const result = parseChecklistItemForm(
      formData({ title: `   ${"a".repeat(200)}   ` }),
    );
    expect("data" in result).toBe(true);
  });
});
