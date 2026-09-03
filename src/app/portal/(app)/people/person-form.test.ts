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

  test("requires at least one role, and names the field in the error", () => {
    expect(parsePersonForm(formData({ name: "Jane" }))).toEqual({
      error:
        "Select at least one role for this person — Donor, Sponsor, Volunteer, or Attendee.",
    });
  });

  test("accepts a single role", () => {
    const result = parsePersonForm(
      formData({ name: "Jane", isVolunteer: "true" }),
    );
    expect("roles" in result && result.roles).toEqual(["volunteer"]);
  });

  test('accepts a native checkbox value of "on"', () => {
    const result = parsePersonForm(
      formData({ name: "Jane", isVolunteer: "on" }),
    );
    expect("roles" in result && result.roles).toEqual(["volunteer"]);
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
      roles: ["donor", "sponsor"],
      data: {
        name: "Jane",
        preferred_name: null,
        email: "jane@example.com",
        phone: "555-1234",
        instagram_handle: "jane.doe",
        notes: "VIP",
        logo_url: "https://example.com/logo.png",
        website: "https://example.com",
        is_organization: false,
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
