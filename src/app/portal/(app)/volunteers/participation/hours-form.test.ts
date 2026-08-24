import { describe, expect, test } from "bun:test";
import { parseParticipationHoursForm } from "./hours-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseParticipationHoursForm", () => {
  test("requires hours", () => {
    expect(
      parseParticipationHoursForm(formData({ loggedDate: "2026-01-05" })),
    ).toEqual({
      error: "Hours must be a positive number.",
    });
  });

  test("rejects zero or negative hours", () => {
    expect(
      parseParticipationHoursForm(
        formData({ hours: "0", loggedDate: "2026-01-05" }),
      ),
    ).toEqual({
      error: "Hours must be a positive number.",
    });
  });

  test("requires a date", () => {
    expect(parseParticipationHoursForm(formData({ hours: "3" }))).toEqual({
      error: "Date is required.",
    });
  });

  test("event and role type are optional", () => {
    const result = parseParticipationHoursForm(
      formData({ hours: "2", loggedDate: "2026-01-05" }),
    );
    expect("data" in result && result.data.eventId).toBeNull();
    expect("data" in result && result.data.volunteerRoleTypeId).toBeNull();
  });

  test("parses valid input", () => {
    const result = parseParticipationHoursForm(
      formData({
        hours: "4.5",
        loggedDate: "2026-01-05",
        notes: "Setup crew",
        eventId: "event-1",
        volunteerRoleTypeId: "role-1",
      }),
    );
    expect("data" in result && result.data.hours).toBe(4.5);
    expect("data" in result && result.data.loggedDate).toBe("2026-01-05");
    expect("data" in result && result.data.notes).toBe("Setup crew");
    expect("data" in result && result.data.eventId).toBe("event-1");
    expect("data" in result && result.data.volunteerRoleTypeId).toBe("role-1");
  });
});
