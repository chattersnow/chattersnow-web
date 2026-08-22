import { describe, expect, test } from "bun:test";
import {
  parseEventAttendanceForm,
  parseEventForm,
  parseEventPlanningForm,
  parseEventReportForm,
} from "./event-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  name: "Winter Fest",
  startsAt: "2026-12-01T10:00",
  timezone: "America/Denver",
  visibility: "public",
  status: "draft",
};

describe("parseEventForm", () => {
  test("parses valid input", () => {
    const result = parseEventForm(formData(validFields));
    expect("data" in result && result.data.name).toBe("Winter Fest");
    expect("data" in result && result.data.visibility).toBe("public");
  });

  test("requires a name", () => {
    expect(parseEventForm(formData({ ...validFields, name: "" }))).toEqual({
      error: "Event name is required.",
    });
  });

  test("requires a start date", () => {
    expect(parseEventForm(formData({ ...validFields, startsAt: "" }))).toEqual({
      error: "Start date and time are required.",
    });
  });

  test("requires a timezone", () => {
    expect(parseEventForm(formData({ ...validFields, timezone: "" }))).toEqual({
      error: "Timezone is required.",
    });
  });

  test("rejects an invalid visibility", () => {
    expect(parseEventForm(formData({ ...validFields, visibility: "hidden" }))).toEqual({
      error: "Select a valid visibility.",
    });
  });

  test("rejects an invalid status", () => {
    expect(parseEventForm(formData({ ...validFields, status: "unknown" }))).toEqual({
      error: "Select a valid status.",
    });
  });

  test("accepts the widened lifecycle statuses", () => {
    for (const status of ["draft", "published", "completed", "cancelled", "archived"] as const) {
      const result = parseEventForm(formData({ ...validFields, status }));
      expect("data" in result && result.data.status).toBe(status);
    }
  });

  test("rejects an end time before the start time", () => {
    const result = parseEventForm(
      formData({ ...validFields, endsAt: "2026-12-01T09:00" })
    );
    expect(result).toEqual({ error: "End time must be after the start time." });
  });

  test("accepts an end time after the start time", () => {
    const result = parseEventForm(
      formData({ ...validFields, endsAt: "2026-12-01T12:00" })
    );
    expect("data" in result && result.data.endsAt).not.toBeNull();
  });
});

describe("parseEventAttendanceForm", () => {
  test("allows an empty attendance count", () => {
    expect(parseEventAttendanceForm(formData({}))).toEqual({
      data: { attendanceCount: null, attendanceNotes: null },
    });
  });

  test("rejects a negative attendance count", () => {
    expect(parseEventAttendanceForm(formData({ attendanceCount: "-1" }))).toEqual({
      error: "Attendance must be a whole number of 0 or more.",
    });
  });

  test("rejects a non-integer attendance count", () => {
    expect(parseEventAttendanceForm(formData({ attendanceCount: "3.2" }))).toEqual({
      error: "Attendance must be a whole number of 0 or more.",
    });
  });

  test("parses a valid attendance count", () => {
    expect(parseEventAttendanceForm(formData({ attendanceCount: "42", attendanceNotes: "Great turnout" }))).toEqual({
      data: { attendanceCount: 42, attendanceNotes: "Great turnout" },
    });
  });
});

describe("parseEventPlanningForm", () => {
  test("allows all-empty planning fields", () => {
    expect(parseEventPlanningForm(formData({}))).toEqual({
      data: {
        eventLeadId: null,
        capacity: null,
        registrationEnabled: false,
        registrationDeadline: null,
        budgetAmount: null,
      },
    });
  });

  test("rejects a negative capacity", () => {
    expect(parseEventPlanningForm(formData({ capacity: "-5" }))).toEqual({
      error: "Capacity must be a whole number of 0 or more.",
    });
  });

  test("rejects a negative budget", () => {
    expect(parseEventPlanningForm(formData({ budgetAmount: "-100" }))).toEqual({
      error: "Budget must be a positive number.",
    });
  });

  test("parses valid planning fields", () => {
    const result = parseEventPlanningForm(
      formData({ capacity: "50", registrationEnabled: "on", budgetAmount: "1200.50" })
    );
    expect("data" in result && result.data.capacity).toBe(50);
    expect("data" in result && result.data.registrationEnabled).toBe(true);
    expect("data" in result && result.data.budgetAmount).toBe(1200.5);
  });
});

describe("parseEventReportForm", () => {
  test("allows all-empty report fields", () => {
    expect(parseEventReportForm(formData({}))).toEqual({
      data: { feedbackNotes: null, contentNotes: null, lessonsLearned: null, reportSummary: null },
    });
  });

  test("parses report fields", () => {
    expect(
      parseEventReportForm(formData({ lessonsLearned: "Start setup earlier next time" }))
    ).toEqual({
      data: {
        feedbackNotes: null,
        contentNotes: null,
        lessonsLearned: "Start setup earlier next time",
        reportSummary: null,
      },
    });
  });
});
