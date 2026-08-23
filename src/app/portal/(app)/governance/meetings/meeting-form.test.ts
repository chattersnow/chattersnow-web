import { describe, expect, test } from "bun:test";
import { parseMeetingForm } from "./meeting-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseMeetingForm", () => {
  test("requires a meeting date", () => {
    expect(parseMeetingForm(formData({ meetingType: "board" }))).toEqual({
      error: "Meeting date and time are required.",
    });
  });

  test("rejects an invalid meeting type", () => {
    expect(
      parseMeetingForm(formData({ meetingDate: "2026-01-01T10:00", meetingType: "social" }))
    ).toEqual({ error: "Select a valid meeting type." });
  });

  test("rejects an invalid status", () => {
    expect(
      parseMeetingForm(
        formData({ meetingDate: "2026-01-01T10:00", meetingType: "board", status: "tentative" })
      )
    ).toEqual({ error: "Select a valid status." });
  });

  test("parses valid input and converts the date to ISO", () => {
    const result = parseMeetingForm(
      formData({
        meetingDate: "2026-01-01T10:00",
        meetingType: "board",
        status: "scheduled",
        location: "Community Center",
        notes: "Quarterly meeting",
      })
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.meeting_type).toBe("board");
      expect(result.data.status).toBe("scheduled");
      expect(result.data.location).toBe("Community Center");
      expect(result.data.notes).toBe("Quarterly meeting");
      expect(new Date(result.data.meeting_date).toISOString()).toBe(result.data.meeting_date);
    }
  });

  test("defaults status to scheduled and optional fields to null", () => {
    const result = parseMeetingForm(formData({ meetingDate: "2026-01-01T10:00", meetingType: "other" }));
    expect(result).toEqual({
      data: {
        meeting_date: new Date("2026-01-01T10:00").toISOString(),
        meeting_type: "other",
        status: "scheduled",
        location: null,
        notes: null,
      },
    });
  });
});
