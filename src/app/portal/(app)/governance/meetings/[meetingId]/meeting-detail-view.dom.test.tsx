import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
  test("shows every section flat, without tabs", () => {
    render(<MeetingDetailView meeting={makeMeeting()} />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    for (const label of [
      "Attendees",
      "Agenda",
      "Action Items",
      "Decisions",
      "Resolutions",
    ]) {
      expect(
        screen.getByRole("heading", { name: label, level: 2 }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Meeting details")).toBeInTheDocument();
    expect(screen.getByText("People & notes")).toBeInTheDocument();
  });

  test("editing happens through a sheet", () => {
    render(<MeetingDetailView meeting={makeMeeting()} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
