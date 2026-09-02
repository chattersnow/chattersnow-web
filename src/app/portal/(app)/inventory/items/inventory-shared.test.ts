import { describe, expect, test } from "bun:test";
import { formatFaceValue } from "./inventory-shared";

describe("formatFaceValue", () => {
  test("returns an em dash for null", () => {
    expect(formatFaceValue(null)).toBe("—");
  });

  test("formats a numeric value as USD currency", () => {
    expect(formatFaceValue(80)).toBe("$80.00");
  });

  test("formats a string value as USD currency", () => {
    expect(formatFaceValue("80")).toBe("$80.00");
  });

  test("returns an em dash for a non-numeric string", () => {
    expect(formatFaceValue("not-a-number")).toBe("—");
  });
});
