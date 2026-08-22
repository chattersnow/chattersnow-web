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
    const result = parsePersonForm(formData({ name: "Jane", isVolunteer: "true" }));
    expect("data" in result && result.data.is_volunteer).toBe(true);
  });

  test("parses valid input", () => {
    const result = parsePersonForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "VIP",
        isDonor: "true",
        isSponsor: "true",
      })
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "VIP",
        is_donor: true,
        is_sponsor: true,
        is_volunteer: false,
      },
    });
  });
});
