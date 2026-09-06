import { describe, expect, test } from "bun:test";
import { parseContactForm } from "./contact-form-parser";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  name: "  Avery Snow  ",
  email: "  avery@example.com  ",
  topic: "volunteering",
  message: "  I would like to help at the next event.  ",
};

describe("parseContactForm", () => {
  test("trims every field on the happy path", () => {
    expect(parseContactForm(formData(validFields))).toEqual({
      data: {
        name: "Avery Snow",
        email: "avery@example.com",
        topic: "volunteering",
        message: "I would like to help at the next event.",
      },
    });
  });

  test("falls back to the general topic when none is chosen", () => {
    const result = parseContactForm(formData({ ...validFields, topic: "  " }));
    expect("data" in result && result.data.topic).toBe("general");
  });

  test("treats missing fields the same as blank ones", () => {
    expect(parseContactForm(new FormData())).toEqual({
      error: "Name is required.",
    });
  });

  test("rejects a whitespace-only name", () => {
    expect(parseContactForm(formData({ ...validFields, name: "   " }))).toEqual(
      { error: "Name is required." },
    );
  });

  test("rejects a whitespace-only message", () => {
    expect(
      parseContactForm(formData({ ...validFields, message: "  \n  " })),
    ).toEqual({ error: "Message is required." });
  });

  test("rejects a blank email", () => {
    expect(parseContactForm(formData({ ...validFields, email: "" }))).toEqual({
      error: "A valid email is required.",
    });
  });

  test("rejects an email with no @", () => {
    expect(
      parseContactForm(
        formData({ ...validFields, email: "avery.example.com" }),
      ),
    ).toEqual({ error: "A valid email is required." });
  });

  test("accepts a name of exactly 200 characters but not 201", () => {
    const atLimit = parseContactForm(
      formData({ ...validFields, name: "a".repeat(200) }),
    );
    expect("data" in atLimit).toBe(true);

    expect(
      parseContactForm(formData({ ...validFields, name: "a".repeat(201) })),
    ).toEqual({ error: "Name is too long." });
  });

  test("accepts a message of exactly 5000 characters but not 5001", () => {
    const atLimit = parseContactForm(
      formData({ ...validFields, message: "a".repeat(5000) }),
    );
    expect("data" in atLimit).toBe(true);

    expect(
      parseContactForm(formData({ ...validFields, message: "a".repeat(5001) })),
    ).toEqual({ error: "Message is too long." });
  });

  test("measures length after trimming, so padding alone cannot overflow", () => {
    const result = parseContactForm(
      formData({ ...validFields, name: `   ${"a".repeat(200)}   ` }),
    );
    expect("data" in result).toBe(true);
  });
});
