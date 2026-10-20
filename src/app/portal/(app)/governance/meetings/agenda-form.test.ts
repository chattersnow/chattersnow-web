import { describe, expect, test } from "bun:test";
import {
  agendaFormatForMeetingType,
  parseAgendaForm,
  parseSimpleAgendaForm,
} from "./agenda-form";

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
        document_path: null,
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
        document_path: null,
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
      document_path: null,
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

  test("rejects well-formed JSON of the wrong shape rather than throwing", () => {
    for (const value of ["null", '"hi"', "[]", "42"]) {
      expect(
        parseAgendaForm(formData({ ...validFields, ongoingItems: value })),
      ).toEqual({
        error: "Could not read the ongoing board items. Please try again.",
      });
    }

    for (const value of ["null", '{"a":1}', "[1,2]", "[null]"]) {
      expect(
        parseAgendaForm(formData({ ...validFields, newBusiness: value })),
      ).toEqual({
        error: "Could not read the new business list. Please try again.",
      });
      expect(
        parseAgendaForm(formData({ ...validFields, parkingLot: value })),
      ).toEqual({
        error: "Could not read the parking lot list. Please try again.",
      });
    }

    for (const value of ["null", '"hi"', "[null]", '["a"]']) {
      expect(
        parseAgendaForm(formData({ ...validFields, upcomingDates: value })),
      ).toEqual({
        error: "Could not read the upcoming dates list. Please try again.",
      });
    }
  });

  test("keeps the source fields on a pinned upcoming date", () => {
    const result = parseAgendaForm(
      formData({
        ...validFields,
        upcomingDates: JSON.stringify([
          {
            date: "2026-04-02",
            description: "Spring gear swap",
            owner: "",
            source_kind: "event",
            source_id: "event-1",
          },
        ]),
      }),
    );
    expect("data" in result && result.data.upcoming_dates).toEqual([
      {
        date: "2026-04-02",
        description: "Spring gear swap",
        owner: "",
        source_kind: "event",
        source_id: "event-1",
      },
    ]);
  });

  test("refuses half a source pair, and a kind outside the two", () => {
    const rejected = [
      // One half of the pair alone names no record.
      { date: "2026-04-02", description: "x", owner: "", source_kind: "event" },
      { date: "2026-04-02", description: "x", owner: "", source_id: "id-1" },
      // A kind outside the pair would reach the minutes as a reference
      // nothing knows how to open.
      {
        date: "2026-04-02",
        description: "x",
        owner: "",
        source_kind: "grant",
        source_id: "id-1",
      },
      {
        date: "2026-04-02",
        description: "x",
        owner: "",
        source_kind: "event",
        source_id: "  ",
      },
    ];

    for (const entry of rejected) {
      expect(
        parseAgendaForm(
          formData({ ...validFields, upcomingDates: JSON.stringify([entry]) }),
        ),
      ).toEqual({
        error: "Could not read the upcoming dates list. Please try again.",
      });
    }
  });

  test("round-trips a sourced section's discussion text", () => {
    const result = parseAgendaForm(
      formData({
        ...validFields,
        ongoingItems: JSON.stringify({
          events: { discussion: "Swap needs two more volunteers." },
        }),
      }),
    );
    expect("data" in result && result.data.ongoing_items).toEqual({
      events: { discussion: "Swap needs two more volunteers." },
    });
  });

  test("keeps the manual pair and the discussion together on one section", () => {
    // A template revised from manual to sourced leaves both shapes in the
    // column. Saving must not drop the half the current shape has no box for.
    const both = {
      events: {
        updates: "Written under version 1.",
        decisions_needed: "Approve the venue.",
        discussion: "Written under version 2.",
      },
    };
    const result = parseAgendaForm(
      formData({ ...validFields, ongoingItems: JSON.stringify(both) }),
    );
    expect("data" in result && result.data.ongoing_items).toEqual(both);
  });

  test("rejects an ongoing item that is not an object", () => {
    expect(
      parseAgendaForm(
        formData({
          ...validFields,
          ongoingItems: JSON.stringify({ fundraising: "just a string" }),
        }),
      ),
    ).toEqual({
      error: "Could not read the ongoing board items. Please try again.",
    });
  });
});

describe("agendaFormatForMeetingType", () => {
  test("only a board meeting gets the board agenda", () => {
    expect(agendaFormatForMeetingType("board")).toBe("board");
    for (const type of ["committee", "annual", "other"]) {
      expect(agendaFormatForMeetingType(type)).toBe("simple");
    }
  });
});

describe("parseSimpleAgendaForm", () => {
  const LONG_TITLE =
    "Review the volunteer coordination plan for the winter gear swap, including shift coverage at both drop-off sites and the backup plan for snow days";
  const LONG_NOTES =
    "Last year we were short four volunteers on the Saturday morning shift. ".repeat(
      15,
    );
  const READ_ERROR = {
    error: "Could not read the agenda items. Please try again.",
  };

  test("keeps order, trims, and drops rows left entirely blank", () => {
    expect(
      parseSimpleAgendaForm(
        formData({
          externalLink: " https://docs.example.com/committee ",
          items: JSON.stringify([
            { id: "b2", title: `  ${LONG_TITLE}  `, notes: `  ${LONG_NOTES}` },
            { id: "c3", title: "", notes: "   " },
            { id: "a1", title: "Budget", notes: "" },
          ]),
        }),
      ),
    ).toEqual({
      data: {
        external_link: "https://docs.example.com/committee",
        document_path: null,
        items: [
          { id: "b2", title: LONG_TITLE, notes: LONG_NOTES.trim() },
          { id: "a1", title: "Budget" },
        ],
      },
    });
  });

  test("treats an empty form as an agenda with no items", () => {
    expect(parseSimpleAgendaForm(new FormData())).toEqual({
      data: { external_link: null, document_path: null, items: [] },
    });
  });

  test("refuses notes with no title", () => {
    expect(
      parseSimpleAgendaForm(
        formData({
          items: JSON.stringify([{ id: "a1", title: " ", notes: "Context" }]),
        }),
      ),
    ).toEqual({ error: "Every agenda item needs a title." });
  });

  test("keeps a pre-filled item's source, and only its own fields (#1624)", () => {
    const source = {
      key: "event_checklist_c1",
      kind: "event" as const,
      id: "event-1",
      label: "Spring Gear Swap",
      date: "2026-10-03",
    };
    expect(
      parseSimpleAgendaForm(
        formData({
          items: JSON.stringify([
            {
              id: "a1",
              title: "Book the hall",
              source: { ...source, extra: 1 },
            },
          ]),
        }),
      ),
    ).toEqual({
      data: {
        external_link: null,
        document_path: null,
        items: [{ id: "a1", title: "Book the hall", source }],
      },
    });
  });

  test("refuses a source it could not link back to", () => {
    const source = {
      key: "event_checklist_c1",
      kind: "event",
      id: "event-1",
      label: "Spring Gear Swap",
      date: "2026-10-03",
    };
    for (const bad of [
      "event-1",
      { ...source, key: "" },
      { ...source, kind: "grant" },
      { ...source, id: " " },
      { ...source, label: undefined },
      { ...source, date: null },
    ]) {
      expect(
        parseSimpleAgendaForm(
          formData({
            items: JSON.stringify([{ id: "a1", title: "T", source: bad }]),
          }),
        ),
      ).toEqual(READ_ERROR);
    }
  });

  test("refuses anything that is not a list of well-formed items", () => {
    for (const items of [
      "not json",
      "null",
      '"a string"',
      JSON.stringify(["Budget"]),
      JSON.stringify([{ title: "No id" }]),
      JSON.stringify([{ id: "", title: "Blank id" }]),
      // The id becomes half a minutes note key, so it keeps to that alphabet.
      JSON.stringify([{ id: "Has Spaces", title: "Bad id" }]),
      JSON.stringify([{ id: "__proto__:x", title: "Bad id" }]),
      JSON.stringify([
        { id: "a1", title: "One" },
        { id: "a1", title: "Same id" },
      ]),
      JSON.stringify([{ id: "a1", title: 3 }]),
      JSON.stringify([{ id: "a1", title: "T", notes: ["x"] }]),
    ]) {
      expect(parseSimpleAgendaForm(formData({ items }))).toEqual(READ_ERROR);
    }
  });
});
