import { describe, expect, test } from "bun:test";
import { parsePersonForm } from "./person-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parsePersonForm", () => {
  test("requires a name", () => {
    expect(parsePersonForm(formData({ isDonor: "true" }))).toEqual({
      error: "Name is required.",
    });
  });

  test("requires at least one role", () => {
    expect(parsePersonForm(formData({ name: "Jane" }))).toEqual({
      error: "Select at least one role.",
    });
  });

  test("accepts a single role", () => {
    const result = parsePersonForm(
      formData({ name: "Jane", isVolunteer: "true" }),
    );
    expect("data" in result && result.data.is_volunteer).toBe(true);
  });

  test('accepts a native checkbox value of "on"', () => {
    const result = parsePersonForm(
      formData({ name: "Jane", isVolunteer: "on" }),
    );
    expect("data" in result && result.data.is_volunteer).toBe(true);
  });

  test("parses valid input", () => {
    const result = parsePersonForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        instagramHandle: "@jane.doe",
        notes: "VIP",
        logoUrl: "https://example.com/logo.png",
        website: "https://example.com",
        isDonor: "true",
        isSponsor: "true",
      }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        instagram_handle: "jane.doe",
        notes: "VIP",
        logo_url: "https://example.com/logo.png",
        website: "https://example.com",
        is_donor: true,
        is_sponsor: true,
        is_volunteer: false,
        is_organization: false,
        is_attendee: false,
        riding_discipline: null,
        ski_experience_level: null,
        snowboard_experience_level: null,
        preferred_mountain: null,
      },
    });
  });

  test("parses the organization checkbox", () => {
    const result = parsePersonForm(
      formData({ name: "Acme Co", isDonor: "true", isOrganization: "true" }),
    );
    expect("data" in result && result.data.is_organization).toBe(true);
  });

  test("rejects an invalid Instagram handle", () => {
    expect(
      parsePersonForm(
        formData({
          name: "Jane",
          isVolunteer: "true",
          instagramHandle: "not valid!",
        }),
      ),
    ).toEqual({
      error:
        "Instagram handle can only contain letters, numbers, periods, and underscores.",
    });
  });

  test("defaults logo_url and website to null when blank", () => {
    const result = parsePersonForm(
      formData({ name: "Jane", isVolunteer: "true" }),
    );
    expect(
      "data" in result &&
        result.data.logo_url === null &&
        result.data.website === null,
    ).toBe(true);
  });

  test("rejects a non-http(s) logo URL scheme", () => {
    expect(
      parsePersonForm(
        formData({
          name: "Jane",
          isVolunteer: "true",
          logoUrl: "javascript:alert(1)",
        }),
      ),
    ).toEqual({ error: "Logo URL must start with http:// or https://." });
  });

  test("rejects a non-http(s) website scheme", () => {
    expect(
      parsePersonForm(
        formData({
          name: "Jane",
          isVolunteer: "true",
          website: "data:text/html,<script>alert(1)</script>",
        }),
      ),
    ).toEqual({ error: "Website must start with http:// or https://." });
  });
});
