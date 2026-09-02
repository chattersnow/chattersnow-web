import { describe, expect, test } from "bun:test";
import { parseShiftForm } from "./shifts-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseShiftForm", () => {
  test("requires a label", () => {
    expect(
      parseShiftForm(
        formData({ startsAt: "2026-01-05T10:00", endsAt: "2026-01-05T13:00" }),
      ),
    ).toEqual({ error: "Label is required." });
  });

  test("requires start and end time", () => {
    expect(parseShiftForm(formData({ label: "Basecamp AM" }))).toEqual({
      error: "Start and end time are required.",
    });
  });

  test("rejects an end time at or before the start time", () => {
    expect(
      parseShiftForm(
        formData({
          label: "Basecamp AM",
          startsAt: "2026-01-05T13:00",
          endsAt: "2026-01-05T10:00",
        }),
      ),
    ).toEqual({ error: "End time must be after start time." });
  });

  test("rejects a non-positive target headcount", () => {
    expect(
      parseShiftForm(
        formData({
          label: "Basecamp AM",
          startsAt: "2026-01-05T10:00",
          endsAt: "2026-01-05T13:00",
          targetHeadcount: "0",
        }),
      ),
    ).toEqual({ error: "Target headcount must be a positive number." });
  });

  test("parses valid input", () => {
    const result = parseShiftForm(
      formData({
        label: "Basecamp AM",
        startsAt: "2026-01-05T10:00",
        endsAt: "2026-01-05T13:00",
        targetHeadcount: "2",
        notes: "Bring radios",
        volunteerRoleTypeId: "role-type-1",
      }),
    );
    expect("data" in result && result.data).toEqual({
      label: "Basecamp AM",
      startsAt: new Date("2026-01-05T10:00").toISOString(),
      endsAt: new Date("2026-01-05T13:00").toISOString(),
      targetHeadcount: 2,
      notes: "Bring radios",
      volunteerRoleTypeId: "role-type-1",
    });
  });

  test("allows an empty target headcount, notes, and role type", () => {
    const result = parseShiftForm(
      formData({
        label: "Basecamp AM",
        startsAt: "2026-01-05T10:00",
        endsAt: "2026-01-05T13:00",
      }),
    );
    expect("data" in result && result.data.targetHeadcount).toBeNull();
    expect("data" in result && result.data.notes).toBeNull();
    expect("data" in result && result.data.volunteerRoleTypeId).toBeNull();
  });
});
