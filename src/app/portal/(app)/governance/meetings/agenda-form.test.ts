import { describe, expect, test } from "bun:test";
import { parseAgendaForm } from "./agenda-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  externalLink: "  https://docs.example.com/agenda  ",
  bodyText: "  Called to order at 6pm.  ",
  templateId: "template-1",
  templateVersionId: "version-1",
  ongoingItems: JSON.stringify({
    fundraising: { updates: "Grant submitted.", decisions_needed: "None." },
  }),
  newBusiness: JSON.stringify(["Spring swap", "  ", "Bus rental"]),
  parkingLot: JSON.stringify(["Uniforms", ""]),
  upcomingDates: JSON.stringify([
    { date: "2026-04-02", description: "Board meeting", owner: "Avery" },
    { date: "", description: "", owner: "" },
  ]),
  nextMeetingDate: "2026-04-02",
  nextMeetingTopics: "  Budget review  ",
};

describe("parseAgendaForm", () => {
  test("parses a fully filled form", () => {
    expect(parseAgendaForm(formData(validFields))).toEqual({
      data: {
        external_link: "https://docs.example.com/agenda",
        body_text: "Called to order at 6pm.",
        template_id: "template-1",
        template_version_id: "version-1",
        ongoing_items: {
          fundraising: {
            updates: "Grant submitted.",
            decisions_needed: "None.",
          },
        },
        new_business: ["Spring swap", "Bus rental"],
        parking_lot: ["Uniforms"],
        upcoming_dates: [
          { date: "2026-04-02", description: "Board meeting", owner: "Avery" },
        ],
        next_meeting_date: "2026-04-02",
        next_meeting_topics: "Budget review",
      },
    });
  });

  test("treats an entirely empty form as an empty agenda", () => {
    expect(parseAgendaForm(new FormData())).toEqual({
      data: {
        external_link: null,
        body_text: null,
        template_id: null,
        template_version_id: null,
        ongoing_items: {},
        new_business: [],
        parking_lot: [],
        upcoming_dates: [],
        next_meeting_date: null,
        next_meeting_topics: null,
      },
    });
  });

  test("turns blank scalar fields into null", () => {
    const result = parseAgendaForm(
      formData({
        ...validFields,
        externalLink: "  ",
        bodyText: "",
        templateId: "",
        templateVersionId: "  ",
        nextMeetingDate: "",
        nextMeetingTopics: "   ",
      }),
    );
    expect("data" in result && result.data).toMatchObject({
      external_link: null,
      body_text: null,
      template_id: null,
      template_version_id: null,
      next_meeting_date: null,
      next_meeting_topics: null,
    });
  });

  test("drops blank and whitespace-only new business lines", () => {
    const result = parseAgendaForm(
      formData({
        ...validFields,
        newBusiness: JSON.stringify(["", "  ", "Real item"]),
      }),
    );
    expect("data" in result && result.data.new_business).toEqual(["Real item"]);
  });

  test("keeps an upcoming date row with any one field filled", () => {
    const result = parseAgendaForm(
      formData({
        ...validFields,
        upcomingDates: JSON.stringify([
          { date: "", description: "Ski swap", owner: "" },
          { date: "", description: "", owner: "" },
        ]),
      }),
    );
    expect("data" in result && result.data.upcoming_dates).toEqual([
      { date: "", description: "Ski swap", owner: "" },
    ]);
  });

  test("reports malformed ongoing items rather than throwing", () => {
    expect(
      parseAgendaForm(formData({ ...validFields, ongoingItems: "{oops" })),
    ).toEqual({
      error: "Could not read the ongoing board items. Please try again.",
    });
  });

  test("reports a malformed new business list", () => {
    expect(
      parseAgendaForm(formData({ ...validFields, newBusiness: "[1," })),
    ).toEqual({
      error: "Could not read the new business list. Please try again.",
    });
  });

  test("reports a malformed parking lot list", () => {
    expect(
      parseAgendaForm(formData({ ...validFields, parkingLot: "not json" })),
    ).toEqual({
      error: "Could not read the parking lot list. Please try again.",
    });
  });

  test("reports a malformed upcoming dates list", () => {
    expect(
      parseAgendaForm(formData({ ...validFields, upcomingDates: "{" })),
    ).toEqual({
      error: "Could not read the upcoming dates list. Please try again.",
    });
  });
});
