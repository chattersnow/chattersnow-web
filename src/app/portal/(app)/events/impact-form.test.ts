import { describe, expect, test } from "bun:test";
import { parseImpactForm } from "./impact-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  firstTimeRiders: "12",
  rentalSubsidiesCount: "4",
  beginnerPairingsCount: "6",
  assistanceTotal: "250.75",
  notes: "  Two buses ran late.  ",
};

describe("parseImpactForm", () => {
  test("parses a fully filled form", () => {
    expect(parseImpactForm(formData(validFields))).toEqual({
      data: {
        first_time_riders: 12,
        rental_subsidies_count: 4,
        beginner_pairings_count: 6,
        assistance_total: 250.75,
        notes: "Two buses ran late.",
      },
    });
  });

  test("leaves every unreported figure null rather than zero", () => {
    expect(parseImpactForm(new FormData())).toEqual({
      data: {
        first_time_riders: null,
        rental_subsidies_count: null,
        beginner_pairings_count: null,
        assistance_total: null,
        notes: null,
      },
    });
  });

  test("treats a whitespace-only count as unreported", () => {
    const result = parseImpactForm(
      formData({ ...validFields, firstTimeRiders: "   " }),
    );
    expect("data" in result && result.data.first_time_riders).toBeNull();
  });

  test("accepts a zero count, which is a reported figure", () => {
    const result = parseImpactForm(
      formData({ ...validFields, firstTimeRiders: "0" }),
    );
    expect("data" in result && result.data.first_time_riders).toBe(0);
  });

  test("names the field in a count error", () => {
    expect(
      parseImpactForm(formData({ ...validFields, firstTimeRiders: "-1" })),
    ).toEqual({
      error: "First-time skiers/snowboarders must be a positive whole number.",
    });
    expect(
      parseImpactForm(
        formData({ ...validFields, rentalSubsidiesCount: "2.5" }),
      ),
    ).toEqual({ error: "Rental subsidies must be a positive whole number." });
    expect(
      parseImpactForm(
        formData({ ...validFields, beginnerPairingsCount: "many" }),
      ),
    ).toEqual({ error: "Beginner pairings must be a positive whole number." });
  });

  test("rejects a non-finite count", () => {
    expect(
      parseImpactForm(
        formData({ ...validFields, firstTimeRiders: "Infinity" }),
      ),
    ).toEqual({
      error: "First-time skiers/snowboarders must be a positive whole number.",
    });
  });

  test("allows a fractional assistance total, unlike the counts", () => {
    const result = parseImpactForm(
      formData({ ...validFields, assistanceTotal: "99.99" }),
    );
    expect("data" in result && result.data.assistance_total).toBe(99.99);
  });

  test("rejects a negative, non-numeric or non-finite assistance total", () => {
    for (const value of ["-5", "lots", "Infinity"]) {
      expect(
        parseImpactForm(formData({ ...validFields, assistanceTotal: value })),
      ).toEqual({
        error: "Total participant assistance must be a positive number.",
      });
    }
  });

  test("turns blank notes into null", () => {
    const result = parseImpactForm(formData({ ...validFields, notes: "   " }));
    expect("data" in result && result.data.notes).toBeNull();
  });
});
