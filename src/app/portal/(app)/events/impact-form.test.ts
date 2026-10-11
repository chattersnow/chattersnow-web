import { describe, expect, test } from "bun:test";
import { parseImpactForm } from "./impact-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

// #1588: notes are the only thing written. The four typed figures are
// archived, so a stale client posting them must not reach the row.
describe("parseImpactForm", () => {
  test("keeps the trimmed notes", () => {
    expect(parseImpactForm(formData({ notes: "  Snow all day.  " }))).toEqual({
      data: { notes: "Snow all day." },
    });
  });

  test("turns blank notes into null", () => {
    expect(parseImpactForm(formData({ notes: "   " }))).toEqual({
      data: { notes: null },
    });
  });

  test("ignores the archived figures entirely", () => {
    const result = parseImpactForm(
      formData({
        notes: "x",
        firstTimeRiders: "12",
        rentalSubsidiesCount: "4",
        assistanceTotal: "250",
        beginnerPairingsCount: "6",
      }),
    );
    expect(result).toEqual({ data: { notes: "x" } });
  });
});
