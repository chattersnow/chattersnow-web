import { describe, expect, test } from "bun:test";
import { emptyPersonForm, packPersonFormData } from "./person-form-fields";
import { parsePersonForm } from "./person-form";

describe("emptyPersonForm", () => {
  test("has no roles set when no default is given", () => {
    const form = emptyPersonForm();
    expect(form.roles).toEqual({
      is_donor: false,
      is_sponsor: false,
      is_volunteer: false,
      is_attendee: false,
    });
  });

  test("sets only the given default role", () => {
    const form = emptyPersonForm("is_sponsor");
    expect(form.roles).toEqual({
      is_donor: false,
      is_sponsor: true,
      is_volunteer: false,
      is_attendee: false,
    });
  });
});

describe("packPersonFormData", () => {
  test("round-trips through parsePersonForm", () => {
    const form = emptyPersonForm("is_sponsor");
    form.name = "Jane Donor";
    form.preferredName = "Janey";
    form.email = "jane@example.com";

    const result = parsePersonForm(packPersonFormData(form));
    expect(result).toEqual({
      roles: ["sponsor"],
      data: {
        name: "Jane Donor",
        preferred_name: "Janey",
        email: "jane@example.com",
        phone: null,
        instagram_handle: null,
        notes: null,
        logo_url: null,
        website: null,
        person_type: "individual",
        riding_discipline: null,
        ski_experience_level: null,
        snowboard_experience_level: null,
        preferred_mountain: null,
      },
    });
  });

  test("packs role booleans as their string form", () => {
    const form = emptyPersonForm("is_donor");
    const formData = packPersonFormData(form);
    expect(formData.get("isDonor")).toBe("true");
    expect(formData.get("isSponsor")).toBe("false");
  });

  test("packs the person type", () => {
    const form = emptyPersonForm("is_donor", "organization");
    const formData = packPersonFormData(form);
    expect(formData.get("personType")).toBe("organization");
  });
});
