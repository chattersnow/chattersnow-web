import { describe, expect, test } from "bun:test";
import {
  parseVolunteerForm,
  parseEventVolunteerHoursForm,
} from "./volunteers-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseVolunteerForm", () => {
  test("allows an empty role and notes", () => {
    expect(parseVolunteerForm(formData({}))).toEqual({
      data: { role: null, notes: null },
    });
  });

  test("trims role and notes", () => {
    const result = parseVolunteerForm(
      formData({ role: " Ride Buddy ", notes: " Prefers mornings " }),
    );
    expect("data" in result && result.data.role).toBe("Ride Buddy");
    expect("data" in result && result.data.notes).toBe("Prefers mornings");
  });
});

describe("parseEventVolunteerHoursForm", () => {
  test("requires hours", () => {
    expect(
      parseEventVolunteerHoursForm(formData({ loggedDate: "2026-01-05" })),
    ).toEqual({
      error: "Hours must be a positive number.",
    });
  });

  test("rejects zero or negative hours", () => {
    expect(
      parseEventVolunteerHoursForm(
        formData({ hours: "0", loggedDate: "2026-01-05" }),
      ),
    ).toEqual({
      error: "Hours must be a positive number.",
    });
  });

  test("requires a date", () => {
    expect(parseEventVolunteerHoursForm(formData({ hours: "3" }))).toEqual({
      error: "Date is required.",
    });
  });

  test("parses valid input", () => {
    const result = parseEventVolunteerHoursForm(
      formData({ hours: "4.5", loggedDate: "2026-01-05", notes: "Setup crew" }),
    );
    expect("data" in result && result.data.hours).toBe(4.5);
    expect("data" in result && result.data.loggedDate).toBe("2026-01-05");
    expect("data" in result && result.data.notes).toBe("Setup crew");
  });
});
