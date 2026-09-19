import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ActionItemsActions from "./action-items-actions";
import * as AgendaActions from "./agenda-actions";
import * as DecisionsActions from "./decisions-actions";
import * as MinutesApprovalActions from "./minutes-approval-actions";
import * as MeetingContextActions from "./meeting-context-actions";
import type { Agenda } from "./agenda-actions";
import type { AgendaTemplateSection } from "./agenda-template-shared";

const SETTLE = { timeout: 4_000 };

// Version 1's shape: seven sections, none of them sourced. Two are enough to
// show the branch; the keys and labels are the seeded ones.
const MANUAL_SECTIONS: AgendaTemplateSection[] = [
  {
    key: "finance_fundraising",
    label: "Finance & Fundraising",
    topics: ["Current financial position"],
  },
  { key: "events", label: "Events", topics: ["Upcoming events"] },
];

// Version 2's: the Events section names the Events module, Marketing & Social
// names calendar categories -- including one this tenant has deactivated.
const SOURCED_SECTIONS: AgendaTemplateSection[] = [
  MANUAL_SECTIONS[0]!,
  { ...MANUAL_SECTIONS[1]!, source: { kind: "events" } },
  {
    key: "marketing_social",
    label: "Marketing & Social",
    topics: ["Upcoming campaigns"],
    source: {
      kind: "calendar",
      categories: ["campaigns_fundraising", "retired_by_this_tenant"],
      item_types: ["content_campaign"],
    },
  },
];

let agendaRow: Agenda | null = null;
const upsertAgendaAction = mock(
  async (_meetingId: string, _formData: FormData) => ({
    success: true as const,
  }),
);

mock.module("./agenda-actions", () => ({
  ...AgendaActions,
  getAgendaAction: mock(async () => ({ data: agendaRow })),
  listActiveAgendaTemplatesAction: mock(async () => ({ data: [] })),
  upsertAgendaAction,
}));
mock.module("./action-items-actions", () => ({
  ...ActionItemsActions,
  listActionItemsAction: mock(async () => ({ data: [] })),
  listCarriedOverActionItemsAction: mock(async () => ({ data: [] })),
}));
mock.module("./decisions-actions", () => ({
  ...DecisionsActions,
  listDecisionsAction: mock(async () => ({ data: [] })),
}));
mock.module("./minutes-approval-actions", () => ({
  ...MinutesApprovalActions,
  getPreviousMeetingMinutesAction: mock(async () => ({ data: null })),
}));
// Both reference reads are stubbed absent: this file is about how a section
// branches on its source, not about what the module feeds will eventually put
// above the box.
mock.module("./meeting-context-actions", () => ({
  ...MeetingContextActions,
  listMeetingDatedContextAction: mock(async () => ({
    error: { message: "not under test" },
  })),
  getMeetingTopicContextAction: mock(async () => ({
    error: { message: "not under test" },
  })),
}));

const { AgendaTab } = await import("./agenda-tab");

function agenda(
  sections: AgendaTemplateSection[],
  ongoing: Agenda["ongoing_items"] = {},
): Agenda {
  return {
    id: "agenda-1",
    meeting_id: "meeting-1",
    external_link: null,
    body_text: null,
    template_id: "template-1",
    template_version_id: "version-1",
    ongoing_items: ongoing,
    new_business: [],
    parking_lot: [],
    upcoming_dates: [],
    next_meeting_date: null,
    next_meeting_topics: null,
    template_sections: sections,
  };
}

function renderTab(mode: "view" | "edit") {
  return render(
    <AgendaTab
      meetingId="meeting-1"
      meetingDate="2026-09-01"
      mode={mode}
      canManage
      minutesApprovedAt={null}
      onViewActionItems={() => {}}
      onViewDecisions={() => {}}
      onExitEdit={() => {}}
    />,
  );
}

beforeEach(() => {
  upsertAgendaAction.mockClear();
  agendaRow = null;
});

describe("AgendaTab ongoing board items", () => {
  test("a manual section keeps both boxes in the form", async () => {
    agendaRow = agenda(MANUAL_SECTIONS);
    renderTab("edit");

    await waitFor(
      () => expect(screen.getAllByLabelText("Updates")).toHaveLength(2),
      SETTLE,
    );
    expect(screen.getAllByLabelText("Decisions needed")).toHaveLength(2);
    expect(screen.queryByLabelText("Discussion")).toBeNull();
  });

  test("a sourced section shows one Discussion box instead", async () => {
    agendaRow = agenda(SOURCED_SECTIONS);
    renderTab("edit");

    await waitFor(
      () => expect(screen.getAllByLabelText("Discussion")).toHaveLength(2),
      SETTLE,
    );
    // Only the one manual section left in version 2's shape.
    expect(screen.getAllByLabelText("Updates")).toHaveLength(1);
    expect(screen.getAllByLabelText("Decisions needed")).toHaveLength(1);
  });

  test("typing in a Discussion box saves it under the section key", async () => {
    agendaRow = agenda(SOURCED_SECTIONS);
    renderTab("edit");

    // Two sections are sourced; the first is Events.
    const box = await waitFor(
      () => screen.getAllByLabelText<HTMLTextAreaElement>("Discussion")[0]!,
      SETTLE,
    );
    fireEvent.change(box, { target: { value: "Two events need volunteers." } });
    fireEvent.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const form = upsertAgendaAction.mock.calls[0]![1];
    expect(JSON.parse(String(form.get("ongoingItems")))).toEqual({
      events: { discussion: "Two events need volunteers." },
    });
  });

  test("editing a sourced section keeps the text its old shape held", async () => {
    // The agenda was written against version 1 and the template moved on.
    agendaRow = agenda(SOURCED_SECTIONS, {
      events: { updates: "Swap logistics confirmed.", decisions_needed: "" },
    });
    renderTab("edit");

    // Two sections are sourced; the first is Events.
    const box = await waitFor(
      () => screen.getAllByLabelText<HTMLTextAreaElement>("Discussion")[0]!,
      SETTLE,
    );
    fireEvent.change(box, { target: { value: "Venue still open." } });
    fireEvent.click(screen.getByRole("button", { name: "Save agenda" }));

    await waitFor(() => expect(upsertAgendaAction).toHaveBeenCalled(), SETTLE);
    const form = upsertAgendaAction.mock.calls[0]![1];
    expect(JSON.parse(String(form.get("ongoingItems")))).toEqual({
      events: {
        updates: "Swap logistics confirmed.",
        decisions_needed: "",
        discussion: "Venue still open.",
      },
    });
  });

  test("an agenda pinned to version 1 still reads as Updates / Decisions needed", async () => {
    agendaRow = agenda(MANUAL_SECTIONS, {
      events: { updates: "Swap logistics confirmed.", decisions_needed: "" },
    });
    renderTab("view");

    await waitFor(
      () => expect(screen.getAllByText("Updates")).toHaveLength(2),
      SETTLE,
    );
    expect(screen.getAllByText("Decisions needed")).toHaveLength(2);
    expect(screen.queryByText("Discussion")).toBeNull();
    expect(screen.getByText("Swap logistics confirmed.")).toBeDefined();
  });

  test("the read view shows every field the row holds, whatever the shape", async () => {
    agendaRow = agenda(SOURCED_SECTIONS, {
      events: {
        updates: "Written under version 1.",
        decisions_needed: "Approve the venue.",
        discussion: "Written under version 2.",
      },
    });
    renderTab("view");

    await waitFor(
      () => expect(screen.getByText("Written under version 2.")).toBeDefined(),
      SETTLE,
    );
    expect(screen.getByText("Written under version 1.")).toBeDefined();
    expect(screen.getByText("Approve the venue.")).toBeDefined();
  });
});
