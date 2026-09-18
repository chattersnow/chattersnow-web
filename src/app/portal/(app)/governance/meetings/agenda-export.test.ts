import { describe, expect, test } from "bun:test";
import {
  formatAgendaMarkdown,
  formatAgendaPlainText,
  type AgendaExportInput,
} from "./agenda-export";
import type { Agenda } from "./agenda-actions";
import { calendarItemEntry, eventEntry } from "../../calendar/calendar-entries";
import type {
  MeetingCalendarItemRow,
  MeetingDatedContext,
} from "./meeting-context-shared";
import type { MeetingTopicContext } from "./meeting-context-catalog";

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
  meetingDate: "2026-08-31T12:00:00.000Z",
  agenda: baseAgenda,
  sections: [],
  openingChecklist: ["Welcome and call to order"],
  carriedOverItems: [],
  createdItems: [],
  decisions: [],
};

const calendarItem: MeetingCalendarItemRow = {
  id: "item-1",
  title: "Trans Day of Visibility",
  item_type: "community_observance",
  starts_at: "2026-09-20T06:00:00.000Z",
  ends_at: null,
  time_zone: "America/Denver",
  summary: null,
  calendar_status: "active",
  series_key: null,
  recurrence_start_month: null,
  recurrence_start_day: null,
  recurrence_end_month: null,
  recurrence_end_day: null,
  recurrence_end_is_month_end: false,
};

const datedContext: MeetingDatedContext = {
  timeZone: "America/Denver",
  asOf: "2026-08-31",
  window: { fromDate: "2026-08-31", toDate: "2026-09-30" },
  entries: [
    eventEntry({
      id: "event-1",
      title: "Fall picnic",
      starts_at: "2026-09-15T22:00:00.000Z",
      ends_at: null,
      time_zone: "America/Denver",
      summary: null,
      location: null,
      status: "published",
      visibility: "public",
      program_ids: [],
    }),
    calendarItemEntry(calendarItem),
  ],
  gaps: [{ source: "events", reason: "forbidden" }],
};

/** What the four supporting sources answered for one meeting (#1224). */
const topicContext: MeetingTopicContext = {
  timeZone: "America/Denver",
  asOf: "2026-08-31",
  review: { fromDate: "2026-06-01", toDate: "2026-08-31" },
  lookahead: { fromDate: "2026-08-31", toDate: "2026-09-30" },
  finance_activity: {
    window: { fromDate: "2026-06-01", toDate: "2026-08-31" },
    income: 4200,
    cashDonations: 1500,
    paidSpend: 2800,
    net: 2900,
    approvedUnpaidSpend: 300,
    pendingSpend: 125.5,
    outstandingReimbursements: { total: 425.5, count: 2 },
    upcomingEventBudget: { total: 1800, count: 3 },
  },
  grants: {
    rows: [
      {
        id: "g1",
        funderName: "Rocky Mountain Community Foundation",
        amount: 10000,
        deadline: "2026-08-15",
        status: "submitted",
        overdue: true,
      },
    ],
    total: 4,
  },
  nonprofit_compliance: {
    milestones: {
      rows: [
        {
          id: "m1",
          label: "File Form 1023-EZ",
          detail: "Federal exemption",
          dueDate: "2026-09-10",
          overdue: false,
        },
      ],
      total: 1,
    },
    requirements: {
      rows: [
        {
          id: "r1",
          label: "Colorado periodic report",
          detail: "in_progress",
          dueDate: "2026-08-01",
          overdue: true,
        },
      ],
      total: 1,
    },
    disclosures: { year: 2027, missing: 2, boardMembers: 5 },
  },
  partnerships: {
    rows: [
      {
        id: "p1",
        organization: "Loveland Ski Area",
        stage: "negotiating",
        nextStepDate: "2026-09-12",
      },
    ],
    total: 2,
  },
};

const seededSections = [
  { key: "finance_fundraising", label: "Finance & Fundraising", topics: [] },
  { key: "legal_nonprofit", label: "Legal & Nonprofit", topics: [] },
  { key: "events", label: "Events", topics: [] },
  {
    key: "community_partnerships",
    label: "Community & Partnerships",
    topics: [],
  },
  { key: "marketing_social", label: "Marketing & Social", topics: [] },
];

describe("formatAgendaMarkdown", () => {
  test("renders empty-state placeholders for an agenda with no content", () => {
    const markdown = formatAgendaMarkdown(emptyInput);
    expect(markdown).toContain("# Agenda — Aug 31, 2026");
    expect(markdown).toContain("- Welcome and call to order");
    expect(markdown).toContain("None carried over.");
    expect(markdown).toContain("No agenda template is configured.");
    expect(markdown).toContain("No decisions recorded yet.");
    expect(markdown).not.toContain("External link:");
    // The live block is omitted rather than printed empty while it is still
    // loading: an empty section reads as "nothing is scheduled".
    expect(markdown).not.toContain("Next 30 days");
  });

  test("prints the live block as dated text, with when it was read", () => {
    const markdown = formatAgendaMarkdown({ ...emptyInput, datedContext });

    expect(markdown).toContain("## Next 30 days");
    expect(markdown).toContain(
      "From the calendar and events, as of Aug 31, 2026.",
    );
    expect(markdown).toContain("- Sep 15, 2026 — Fall picnic (Event)");
    expect(markdown).toContain(
      "- Sep 20, 2026 — Trans Day of Visibility (Calendar item)",
    );
    // A page that silently omits a source gives its reader no way to know it
    // did, so the gap is printed too.
    expect(markdown).toContain(
      "Events are not included — the exporter's role does not cover them.",
    );
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
          minutes_item_key: null,
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

  test("prints the records behind each standing section", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });

    expect(markdown).toContain("Supporting records, as of Aug 31, 2026.");
    expect(markdown).toContain(
      "**Finance activity** — Jun 1, 2026 – Aug 31, 2026",
    );
    expect(markdown).toContain("- Income: $4,200.00");
    expect(markdown).toContain("- Net: $2,900.00");
    expect(markdown).toContain(
      "- Outstanding reimbursements: $425.50 across 2",
    );
    expect(markdown).toContain(
      "- Budgeted for upcoming events: $1,800.00 across 3",
    );
    expect(markdown).toContain(
      "- Rocky Mountain Community Foundation — $10,000.00, Submitted, due Aug 15, 2026 (overdue)",
    );
    expect(markdown).toContain("4 open in total.");
    expect(markdown).toContain(
      "- 501(c)(3) milestone: File Form 1023-EZ (Federal exemption) — due Sep 10, 2026",
    );
    expect(markdown).toContain(
      "- Annual requirement: Colorado periodic report (In progress) — due Aug 1, 2026 (overdue)",
    );
    expect(markdown).toContain(
      "- Conflict-of-interest disclosures: 2 of 5 board members have none on file for FY2027",
    );
    expect(markdown).toContain("- Loveland Ski Area — Negotiating");
  });

  test("prints an undated milestone as having no due date", () => {
    const compliance = topicContext.nonprofit_compliance;
    if ("unavailable" in compliance) throw new Error("fixture regressed");

    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext: {
        ...topicContext,
        nonprofit_compliance: {
          ...compliance,
          milestones: {
            rows: [
              {
                id: "m2",
                label: "Draft bylaws",
                detail: "Incorporation",
                dueDate: null,
                overdue: false,
              },
            ],
            total: 8,
          },
        },
      },
    });

    expect(markdown).toContain(
      "- 501(c)(3) milestone: Draft bylaws (Incorporation) — no due date",
    );
  });

  test("leaves an unmapped section untouched", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });
    const marketing = markdown.slice(
      markdown.indexOf("### Marketing & Social"),
    );

    expect(marketing).not.toContain("Supporting records");
  });

  test("does not repeat the calendar under Events", () => {
    // The agenda already prints its own "Next 30 days" section a few headings
    // later; the Events block would be the same list twice on one page.
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
      topicContext,
      datedContext,
    });

    expect(markdown.match(/Fall picnic \(Event\)/g)).toHaveLength(1);
  });

  test("omits every block while the read is still in flight", () => {
    const markdown = formatAgendaMarkdown({
      ...emptyInput,
      sections: seededSections,
    });
    expect(markdown).not.toContain("Supporting records");
  });

  test("calls the agenda's free-text field Agenda notes", () => {
    // Renamed from "Meeting notes" in #1201: since #1200 the minutes are their
    // own record, and this field is the pre-meeting context, not the minutes.
    const markdown = formatAgendaMarkdown(emptyInput);
    expect(markdown).toContain("## Agenda notes");
    expect(markdown).not.toContain("Meeting notes");
  });
});

describe("formatAgendaPlainText", () => {
  test("uses plain uppercase headers instead of markdown syntax", () => {
    const text = formatAgendaPlainText(emptyInput);
    expect(text).toContain("AGENDA — Aug 31, 2026");
    expect(text).toContain("OPENING");
    expect(text).toContain("AGENDA NOTES");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
  });

  test("indents the supporting blocks without markdown emphasis", () => {
    const text = formatAgendaPlainText({
      ...emptyInput,
      sections: seededSections,
      topicContext,
    });

    expect(text).toContain("  Supporting records, as of Aug 31, 2026.");
    expect(text).toContain("  Finance activity — Jun 1, 2026 – Aug 31, 2026");
    expect(text).toContain("  - Income: $4,200.00");
    expect(text).not.toContain("**");
  });

  test("indents the live block under its own uppercase header", () => {
    const text = formatAgendaPlainText({ ...emptyInput, datedContext });

    expect(text).toContain("NEXT 30 DAYS");
    expect(text).toContain(
      "  From the calendar and events, as of Aug 31, 2026.",
    );
    expect(text).toContain("  - Sep 15, 2026 — Fall picnic (Event)");
    expect(text).not.toContain("#");
  });
});
