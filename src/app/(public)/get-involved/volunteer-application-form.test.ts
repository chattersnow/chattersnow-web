import { describe, expect, test } from "bun:test";
import { parseVolunteerApplicationForm } from "./volunteer-application-form";
import { PRONOUNS_TOO_LONG_ERROR } from "@/lib/pronouns";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseVolunteerApplicationForm", () => {
  test("requires a name", () => {
    expect(
      parseVolunteerApplicationForm(formData({ email: "jane@example.com" })),
    ).toEqual({ error: "Name is required." });
  });

  test("requires a valid email", () => {
    expect(parseVolunteerApplicationForm(formData({ name: "Jane" }))).toEqual({
      error: "A valid email is required.",
    });
    expect(
      parseVolunteerApplicationForm(
        formData({ name: "Jane", email: "not-an-email" }),
      ),
    ).toEqual({ error: "A valid email is required." });
  });

  test("rejects an overly long name", () => {
    expect(
      parseVolunteerApplicationForm(
        formData({ name: "a".repeat(201), email: "jane@example.com" }),
      ),
    ).toEqual({ error: "Name is too long." });
  });

  test("rejects overly long availability notes", () => {
    expect(
      parseVolunteerApplicationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          availability: "a".repeat(2001),
        }),
      ),
    ).toEqual({ error: "Notes are too long." });
  });

  test("rejects pronouns over the column length", () => {
    expect(
      parseVolunteerApplicationForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          pronouns: "x".repeat(41),
        }),
      ),
    ).toEqual({ error: PRONOUNS_TOO_LONG_ERROR });
  });

  test("trims fields and defaults empty optionals to null", () => {
    const result = parseVolunteerApplicationForm(
      formData({ name: "  Jane  ", email: "  jane@example.com  " }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: null,
        pronouns: null,
        role_interest: null,
        availability: null,
      },
    });
  });

  test("parses valid input", () => {
    const result = parseVolunteerApplicationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        pronouns: "  they/them  ",
        roleInterest: "On-Snow Mentor",
        availability: "Weekends",
      }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        pronouns: "they/them",
        role_interest: "On-Snow Mentor",
        availability: "Weekends",
      },
    });
  });
});
