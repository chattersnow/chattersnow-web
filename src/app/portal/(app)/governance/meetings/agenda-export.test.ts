import { describe, expect, test } from "bun:test";
import {
  formatAgendaMarkdown,
  formatAgendaPlainText,
  type AgendaExportInput,
} from "./agenda-export";
import type { Agenda } from "./agenda-actions";

const baseAgenda: Agenda = {
  id: "agenda-1",
  meeting_id: "meeting-1",
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
  template_sections: [],
};

const emptyInput: AgendaExportInput = {
  meetingDate: "2026-08-31",
  agenda: baseAgenda,
  sections: [],
  openingChecklist: ["Welcome and call to order"],
  carriedOverItems: [],
  createdItems: [],
  decisions: [],
};

describe("formatAgendaMarkdown", () => {
  test("renders empty-state placeholders for an agenda with no content", () => {
    const markdown = formatAgendaMarkdown(emptyInput);
    expect(markdown).toContain("# Agenda — Aug 31, 2026");
    expect(markdown).toContain("- Welcome and call to order");
    expect(markdown).toContain("None carried over.");
    expect(markdown).toContain("No agenda template is configured.");
    expect(markdown).toContain("No decisions recorded yet.");
    expect(markdown).not.toContain("External link:");
  });

  test("includes structured content and formatting", () => {
    const input: AgendaExportInput = {
      ...emptyInput,
      agenda: {
        ...baseAgenda,
        external_link: "https://example.com/notes",
        new_business: ["Budget review"],
        parking_lot: ["Website redesign"],
        upcoming_dates: [
          { date: "2026-09-15", description: "Fall picnic", owner: "Jamie" },
        ],
        next_meeting_date: "2026-09-30",
        next_meeting_topics: "Budget approval",
        body_text: "Discussed fall planning.",
        ongoing_items: {
          finance: { updates: "On budget", decisions_needed: "None" },
        },
      },
      sections: [{ key: "finance", label: "Finance", topics: [] }],
      carriedOverItems: [
        {
          id: "a1",
          meeting_id: "meeting-1",
          description: "Order supplies",
          due_date: null,
          status: "open",
          owner: { id: "p1", name: "Alex", email: null, phone: null },
        },
      ],
      decisions: [
        {
          id: "d1",
          meeting_id: "meeting-1",
          description: "Approve budget",
          decision_date: "2026-08-31",
          topic: "Finance",
          vote_result: "5-0",
        },
      ],
    };

    const markdown = formatAgendaMarkdown(input);
    expect(markdown).toContain("External link: https://example.com/notes");
    expect(markdown).toContain("### Finance");
    expect(markdown).toContain("**Updates:** On budget");
    expect(markdown).toContain("- Order supplies — Alex");
    expect(markdown).toContain("- Finance: Approve budget (5-0)");
    expect(markdown).toContain("- Budget review");
    expect(markdown).toContain("Sep 15, 2026 — Fall picnic (Jamie)");
    expect(markdown).toContain("Sep 30, 2026 — Budget approval");
    expect(markdown).toContain("Discussed fall planning.");
  });
});

describe("formatAgendaPlainText", () => {
  test("uses plain uppercase headers instead of markdown syntax", () => {
    const text = formatAgendaPlainText(emptyInput);
    expect(text).toContain("AGENDA — Aug 31, 2026");
    expect(text).toContain("OPENING");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
  });
});
