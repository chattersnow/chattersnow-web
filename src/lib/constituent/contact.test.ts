import { describe, expect, test } from "bun:test";
import { parseMyContactForm } from "./contact";

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseMyContactForm", () => {
  test("an empty form is a valid form", () => {
    const result = parseMyContactForm(formData({}));
    expect(result).toEqual({
      args: {
        p_preferred_name: null,
        p_phone: null,
        p_pronouns: null,
        p_instagram_handle: null,
        p_preferred_mountain: null,
        p_riding_discipline: null,
        p_ski_experience_level: null,
        p_snowboard_experience_level: null,
        p_address_line1: null,
        p_address_line2: null,
        p_address_city: null,
        p_address_region: null,
        p_address_postal_code: null,
        p_address_country: null,
      },
    });
  });

  test("trims, and strips a leading @ from the handle", () => {
    const result = parseMyContactForm(
      formData({
        preferredName: "  Janey  ",
        phone: " 555-1234 ",
        instagramHandle: "@jane.doe",
        addressCity: " Hunter ",
      }),
    );
    expect("args" in result && result.args.p_preferred_name).toBe("Janey");
    expect("args" in result && result.args.p_phone).toBe("555-1234");
    expect("args" in result && result.args.p_instagram_handle).toBe("jane.doe");
    expect("args" in result && result.args.p_address_city).toBe("Hunter");
  });

  test("refuses a handle that is not one", () => {
    const result = parseMyContactForm(
      formData({ instagramHandle: "jane doe!" }),
    );
    expect("error" in result).toBe(true);
  });

  test("refuses pronouns longer than the column holds", () => {
    const result = parseMyContactForm(formData({ pronouns: "x".repeat(41) }));
    expect("error" in result).toBe(true);
  });

  // The database's own people_ski_level_requires_ski check would reject this,
  // and the person never touched the field it would name.
  test("drops a level for a discipline the person does not ride", () => {
    const result = parseMyContactForm(
      formData({
        ridingDiscipline: "snowboard",
        skiExperienceLevel: "advanced",
        snowboardExperienceLevel: "beginner",
      }),
    );
    expect("args" in result && result.args.p_ski_experience_level).toBeNull();
    expect("args" in result && result.args.p_snowboard_experience_level).toBe(
      "beginner",
    );
  });

  test("drops both levels when no discipline is given", () => {
    const result = parseMyContactForm(
      formData({
        skiExperienceLevel: "advanced",
        snowboardExperienceLevel: "beginner",
      }),
    );
    expect("args" in result && result.args.p_riding_discipline).toBeNull();
    expect("args" in result && result.args.p_ski_experience_level).toBeNull();
    expect(
      "args" in result && result.args.p_snowboard_experience_level,
    ).toBeNull();
  });

  test("refuses a discipline that is not one", () => {
    expect(
      "error" in parseMyContactForm(formData({ ridingDiscipline: "sledding" })),
    ).toBe(true);
  });

  /**
   * The point of the whole ticket: the parser's output is the RPC's argument
   * list and nothing else. A field somebody adds to the form later -- notes,
   * a role, `is_anonymous` -- has to be added here to travel, and the RPC has
   * no argument to receive it even then.
   */
  test("carries nothing that is not on the allowlist", () => {
    const result = parseMyContactForm(
      formData({
        name: "Someone Else",
        notes: "not mine to write",
        isAnonymous: "true",
        sourceType: "manual",
        email: "new@example.com",
      }),
    );
    const keys = "args" in result ? Object.keys(result.args).sort() : [];
    expect(keys).toEqual([
      "p_address_city",
      "p_address_country",
      "p_address_line1",
      "p_address_line2",
      "p_address_postal_code",
      "p_address_region",
      "p_instagram_handle",
      "p_phone",
      "p_preferred_mountain",
      "p_preferred_name",
      "p_pronouns",
      "p_riding_discipline",
      "p_ski_experience_level",
      "p_snowboard_experience_level",
    ]);
  });
});
