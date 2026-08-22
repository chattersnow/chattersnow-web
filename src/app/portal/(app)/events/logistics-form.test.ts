import { describe, expect, test } from "bun:test";
import { parseLogisticsForm } from "./logistics-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseLogisticsForm", () => {
  test("treats blank fields as null", () => {
    expect(parseLogisticsForm(formData({}))).toEqual({
      data: {
        meeting_point: null,
        gear_requirements: null,
        transportation: null,
        food: null,
        supplies: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        notes: null,
      },
    });
  });

  test("trims and keeps provided fields", () => {
    const result = parseLogisticsForm(
      formData({ meetingPoint: "  Base lodge  ", emergencyContactName: "Jamie" })
    );
    expect("data" in result && result.data.meeting_point).toBe("Base lodge");
    expect("data" in result && result.data.emergency_contact_name).toBe("Jamie");
  });
});
