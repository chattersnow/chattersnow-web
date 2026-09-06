import { describe, expect, test } from "bun:test";
import { parseEventStaffForm } from "./staff-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("parseEventStaffForm", () => {
  test("trims the role and notes", () => {
    expect(
      parseEventStaffForm(
        formData({ role: "  Basecamp lead  ", notes: "  Arrives at 7am.  " }),
      ),
    ).toEqual({ data: { role: "Basecamp lead", notes: "Arrives at 7am." } });
  });

  test("turns blank fields into null", () => {
    expect(parseEventStaffForm(formData({ role: "  ", notes: "" }))).toEqual({
      data: { role: null, notes: null },
    });
  });

  test("accepts an entirely empty form, since both fields are optional", () => {
    expect(parseEventStaffForm(new FormData())).toEqual({
      data: { role: null, notes: null },
    });
  });

  test("accepts free-text roles, since there is no staff-role catalog", () => {
    const result = parseEventStaffForm(
      formData({ role: "Whatever the day needs" }),
    );
    expect("data" in result && result.data.role).toBe("Whatever the day needs");
  });
});
