import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import * as AttendeesActions from "../attendees-actions";
import * as AgendaActions from "../agenda-actions";
import * as ActionItemsActions from "../action-items-actions";
import * as DecisionsActions from "../decisions-actions";
import * as MinutesApprovalActions from "../minutes-approval-actions";
import * as MinutesActions from "../minutes-actions";
import * as MeetingContextActions from "../meeting-context-actions";
import * as ResolutionsActions from "../../resolutions/resolutions-actions";
import * as PeopleActions from "../../../people/actions";
import type { MeetingRow } from "../meeting-badges";
import { mockUrlTabState } from "@/../test/url-tab-state-mock";

const urlTabState = mockUrlTabState();

mock.module("../attendees-actions", () => ({
  ...AttendeesActions,
  listMeetingAttendeesAction: mock(async () => ({ data: [] })),
}));
mock.module("../agenda-actions", () => ({
  ...AgendaActions,
  getAgendaAction: mock(async () => ({ data: null })),
  listActiveAgendaTemplatesAction: mock(async () => ({ data: [] })),
}));
mock.module("../action-items-actions", () => ({
  ...ActionItemsActions,
  listActionItemsAction: mock(async () => ({ data: [] })),
  listCarriedOverActionItemsAction: mock(async () => ({ data: [] })),
}));
mock.module("../decisions-actions", () => ({
  ...DecisionsActions,
  listDecisionsAction: mock(async () => ({ data: [] })),
}));
mock.module("../minutes-approval-actions", () => ({
  ...MinutesApprovalActions,
  getPreviousMeetingMinutesAction: mock(async () => ({ data: null })),
}));
mock.module("../minutes-actions", () => ({
  ...MinutesActions,
  getMinutesAction: mock(async () => ({ data: null })),
}));
// The agenda tab's live "Next 30 days" read (#1223). Answered with an empty
// window rather than left unmocked: unstubbed it reaches `cookies()`, which
// throws outside a request scope.
mock.module("../meeting-context-actions", () => ({
  ...MeetingContextActions,
  listMeetingDatedContextAction: mock(async () => ({
    data: {
      timeZone: "America/Denver",
      asOf: "2026-09-01",
      window: { fromDate: "2026-09-01", toDate: "2026-10-01" },
      entries: [],
      gaps: [],
    },
  })),
  // #1224's supporting-records read. Stubbed with empty payloads rather than
  // absent-with-reason ones, so the blocks render nothing at all and these
  // files stay about the lifecycle they were written for.
  getMeetingTopicContextAction: mock(async () => ({
    data: {
      timeZone: "America/Denver",
      asOf: "2026-09-01",
      review: { fromDate: "2026-08-01", toDate: "2026-09-01" },
      lookahead: { fromDate: "2026-09-01", toDate: "2026-10-01" },
      finance_activity: {
        window: { fromDate: "2026-08-01", toDate: "2026-09-01" },
        income: 0,
        cashDonations: 0,
        paidSpend: 0,
        net: 0,
        approvedUnpaidSpend: 0,
        pendingSpend: 0,
        outstandingReimbursements: null,
        upcomingEventBudget: null,
      },
      grants: { rows: [], total: 0 },
      nonprofit_compliance: {
        milestones: { rows: [], total: 0 },
        requirements: { rows: [], total: 0 },
        disclosures: { year: 2027, missing: 0, boardMembers: 0 },
      },
      partnerships: { rows: [], total: 0 },
    },
  })),
}));
mock.module("../../resolutions/resolutions-actions", () => ({
  ...ResolutionsActions,
  listResolutionsAction: mock(async () => ({ data: [] })),
}));
mock.module("../../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: mock(async () => ({ data: [] })),
}));

const { MeetingDetailView } = await import("./meeting-detail-view");

function makeMeeting(overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id: "meeting-1",
    meeting_date: "2026-09-01T18:00:00.000Z",
    meeting_type: "board",
    status: "scheduled",
    location: "HQ",
    notes: null,
    facilitator: null,
    notetaker: null,
    minutes_approved_at: null,
    ...overrides,
  };
}

describe("MeetingDetailView", () => {
  afterEach(() => urlTabState.seed(null));

  test("shows Overview, Agenda and Minutes tabs, with Overview active", () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Minutes" })).toBeInTheDocument();

    // Overview holds everything but the agenda.
    expect(screen.getByText("Meeting details")).toBeInTheDocument();
    expect(screen.getByText("People & notes")).toBeInTheDocument();
    for (const label of [
      "Attendees",
      "Action Items",
      "Decisions",
      "Resolutions",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test("shows the agenda card on the Agenda tab", () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));

    expect(screen.getByText("Agenda", { selector: "div" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit agenda" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Meeting details")).not.toBeInTheDocument();
  });

  test("edits inline per card, without an edit sheet", () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    expect(
      screen.getByRole("button", { name: "Edit meeting details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit people & notes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  test("hides edit controls without manage access", () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={false} />);

    expect(
      screen.queryByRole("button", { name: "Edit meeting details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit people & notes" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    expect(
      screen.queryByRole("button", { name: "Edit agenda" }),
    ).not.toBeInTheDocument();
  });

  test("confirms before discarding unsaved agenda edits when switching to Overview", async () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit agenda" }));
    fireEvent.change(await screen.findByLabelText("External link"), {
      target: { value: "https://example.com/agenda" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    // The tab switch hasn't happened yet -- still on the (dirty) Agenda form.
    expect(screen.queryByText("Meeting details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("External link")).toHaveValue(
      "https://example.com/agenda",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByText("Meeting details")).toBeInTheDocument();

    // Agenda's edit mode -- and its unsaved value -- were discarded.
    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    expect(
      screen.getByRole("button", { name: "Edit agenda" }),
    ).toBeInTheDocument();
  });

  test("switches to Overview without a prompt when the agenda form isn't dirty", async () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit agenda" }));
    await screen.findByLabelText("External link");

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByText("Meeting details")).toBeInTheDocument();
  });

  test("opens on the Minutes tab from a ?tab=minutes link", async () => {
    urlTabState.seed("minutes");
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    expect(screen.getByRole("tab", { name: "Minutes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The panel is really mounted, not merely selected: Base UI unmounts the
    // inactive ones, so a deep link is the only way this subtree renders
    // without a click.
    expect(
      await screen.findByText("No minutes started yet", {}, { timeout: 4_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Meeting details")).not.toBeInTheDocument();
  });
});
