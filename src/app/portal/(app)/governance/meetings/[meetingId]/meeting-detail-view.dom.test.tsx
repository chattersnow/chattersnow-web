import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import * as AttendeesActions from "../attendees-actions";
import * as AgendaActions from "../agenda-actions";
import * as ActionItemsActions from "../action-items-actions";
import * as DecisionsActions from "../decisions-actions";
import * as ResolutionsActions from "../../resolutions/resolutions-actions";
import * as PeopleActions from "../../../people/actions";
import type { MeetingRow } from "../meeting-badges";

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
    ...overrides,
  };
}

describe("MeetingDetailView", () => {
  test("shows an Overview and an Agenda tab, with Overview active", () => {
    render(<MeetingDetailView meeting={makeMeeting()} canManage={true} />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agenda" })).toBeInTheDocument();

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
});
