import { describe, expect, test } from "bun:test";
import {
  mapVolunteerApplicationStatusToLabel,
  parseVolunteerStatusLookupForm,
} from "./volunteer-status-lookup-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseVolunteerStatusLookupForm", () => {
  test("requires a valid email", () => {
    expect(
      parseVolunteerStatusLookupForm(formData({ referenceCode: "ABCD1234" })),
    ).toEqual({ error: "A valid email is required." });
    expect(
      parseVolunteerStatusLookupForm(
        formData({ email: "not-an-email", referenceCode: "ABCD1234" }),
      ),
    ).toEqual({ error: "A valid email is required." });
  });

  test("requires a reference code", () => {
    expect(
      parseVolunteerStatusLookupForm(formData({ email: "jane@example.com" })),
    ).toEqual({ error: "Reference code is required." });
  });

  test("trims fields and parses valid input", () => {
    expect(
      parseVolunteerStatusLookupForm(
        formData({
          email: "  jane@example.com  ",
          referenceCode: "  ABCD1234  ",
        }),
      ),
    ).toEqual({
      data: { email: "jane@example.com", referenceCode: "ABCD1234" },
    });
  });
});

describe("mapVolunteerApplicationStatusToLabel", () => {
  test("maps each internal status to its applicant-facing label", () => {
    expect(mapVolunteerApplicationStatusToLabel("new")).toBe("Received");
    expect(mapVolunteerApplicationStatusToLabel("being reviewed")).toBe(
      "In review",
    );
    expect(mapVolunteerApplicationStatusToLabel("contacted")).toBe("In review");
    expect(mapVolunteerApplicationStatusToLabel("placed")).toBe("Placed");
    expect(mapVolunteerApplicationStatusToLabel("declined")).toBe(
      "Not moving forward at this time",
    );
    expect(mapVolunteerApplicationStatusToLabel("closed")).toBe(
      "Not moving forward at this time",
    );
  });
});
