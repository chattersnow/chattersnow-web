import { describe, expect, test } from "bun:test";
import { parseGearRequestForm } from "./gear-request-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseGearRequestForm", () => {
  test("requires a name", () => {
    expect(
      parseGearRequestForm(formData({ email: "jane@example.com" })),
    ).toEqual({
      error: "Name is required.",
    });
  });

  test("requires a valid email", () => {
    expect(parseGearRequestForm(formData({ name: "Jane" }))).toEqual({
      error: "A valid email is required.",
    });
    expect(
      parseGearRequestForm(formData({ name: "Jane", email: "not-an-email" })),
    ).toEqual({ error: "A valid email is required." });
  });

  test("normalizes empty phone and notes to null", () => {
    const result = parseGearRequestForm(
      formData({ name: "Jane", email: "jane@example.com" }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: null,
        notes: null,
      },
    });
  });

  test("parses valid input", () => {
    const result = parseGearRequestForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "Need it by Friday",
      }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "Need it by Friday",
      },
    });
  });
});
