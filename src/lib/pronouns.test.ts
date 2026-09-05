import { describe, expect, test } from "bun:test";
import {
  PRONOUNS_MAX_LENGTH,
  PRONOUNS_TOO_LONG_ERROR,
  parsePronouns,
} from "./pronouns";

describe("parsePronouns", () => {
  test("trims what it keeps", () => {
    expect(parsePronouns("  she/her  ")).toEqual({ pronouns: "she/her" });
  });

  test("treats blank and missing alike — the field is optional", () => {
    expect(parsePronouns("")).toEqual({ pronouns: null });
    expect(parsePronouns("   ")).toEqual({ pronouns: null });
    expect(parsePronouns(null)).toEqual({ pronouns: null });
  });

  test("accepts anything typed, not just the suggestions", () => {
    expect(parsePronouns("ey/em")).toEqual({ pronouns: "ey/em" });
    expect(parsePronouns("Jamie")).toEqual({ pronouns: "Jamie" });
  });

  test("rejects over the length the column accepts", () => {
    expect(parsePronouns("x".repeat(PRONOUNS_MAX_LENGTH))).toEqual({
      pronouns: "x".repeat(PRONOUNS_MAX_LENGTH),
    });
    expect(parsePronouns("x".repeat(PRONOUNS_MAX_LENGTH + 1))).toEqual({
      error: PRONOUNS_TOO_LONG_ERROR,
    });
  });

  test("measures the trimmed value, not the padding", () => {
    expect(parsePronouns(`  ${"x".repeat(PRONOUNS_MAX_LENGTH)}  `)).toEqual({
      pronouns: "x".repeat(PRONOUNS_MAX_LENGTH),
    });
  });
});
