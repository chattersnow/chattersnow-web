import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import * as MinutesActions from "./minutes-actions";
import * as ActionItemsActions from "./action-items-actions";
import * as AgendaActions from "./agenda-actions";
import * as PeopleActions from "../../people/actions";
import type { MinutesRow } from "./minutes-core";
import type { MinutesLeaveGuard } from "./minutes-editor";

const SETTLE = { timeout: 4_000 };

const getMinutesAction = mock(
  async (): Promise<{ data: MinutesRow | null }> => ({ data: null }),
);
const startMinutesFromAgendaAction = mock(async () => ({
  success: true as const,
  data: draftMinutes(),
}));
const saveMinutesDraftAction = mock(async () => ({
  success: true as const,
  savedAt: "2026-09-01T18:05:00.000Z",
}));
const finalizeMinutesAction = mock(async () => ({ success: true as const }));
const listActionItemsAction = mock(async () => ({ data: [] }));

mock.module("./minutes-actions", () => ({
  ...MinutesActions,
  getMinutesAction,
  startMinutesFromAgendaAction,
  saveMinutesDraftAction,
  finalizeMinutesAction,
  reopenMinutesAction: mock(async () => ({ success: true as const })),
}));
mock.module("./action-items-actions", () => ({
  ...ActionItemsActions,
  listActionItemsAction,
  listCarriedOverActionItemsAction: mock(async () => ({ data: [] })),
  createActionItemAction: mock(async () => ({ success: true as const })),
}));
mock.module("./agenda-actions", () => ({
  ...AgendaActions,
  getAgendaAction: mock(async () => ({ data: { id: "agenda-1" } })),
  listActiveAgendaTemplatesAction: mock(async () => ({ data: [] })),
}));
mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: mock(async () => ({ data: [] })),
}));

const { MinutesTab } = await import("./minutes-tab");

function draftMinutes(overrides: Partial<MinutesRow> = {}): MinutesRow {
  return {
    id: "minutes-1",
    meeting_id: "meeting-1",
    agenda_snapshot: {
      version: 1,
      meeting_date: "2026-09-01",
      template_id: null,
      template_version_id: null,
      external_link: null,
      items: [
        {
          key: "opening",
          label: "Opening",
          kind: "opening",
          planned: { topics: ["Call to order"] },
        },
        {
          key: "section:finance_fundraising",
          label: "Finance & Fundraising",
          kind: "section",
          planned: { updates: "Grant report due", decisions_needed: "" },
        },
        { key: "next_meeting", label: "Next meeting", kind: "next_meeting" },
      ],
    },
    notes: {},
    body_text: null,
    status: "draft",
    finalized_at: null,
    finalized_by: null,
    approved_at: null,
    approved_by: null,
    approved_at_meeting_id: null,
    updated_at: "2026-09-01T18:00:00.000Z",
    ...overrides,
  };
}

function renderTab(canManage = true) {
  const guardRef = createRef<MinutesLeaveGuard | null>();
  render(
    <MinutesTab
      meetingId="meeting-1"
      canManage={canManage}
      guardRef={guardRef}
    />,
  );
  return guardRef;
}

describe("MinutesTab", () => {
  beforeEach(() => {
    getMinutesAction.mockClear();
    startMinutesFromAgendaAction.mockClear();
    saveMinutesDraftAction.mockClear();
    finalizeMinutesAction.mockClear();
    listActionItemsAction.mockClear();
    getMinutesAction.mockImplementation(async () => ({ data: null }));
  });

  test("offers to start minutes from the agenda when there are none", async () => {
    renderTab();

    expect(
      await screen.findByText("No minutes started yet", {}, SETTLE),
    ).toBeInTheDocument();
    const start = screen.getByRole("button", {
      name: "Start minutes from agenda",
    });

    await act(async () => {
      start.click();
    });
    expect(startMinutesFromAgendaAction).toHaveBeenCalledWith("meeting-1");
  });

  test("hides the start control from a viewer without manage access", async () => {
    renderTab(false);

    expect(
      await screen.findByText("No minutes started yet", {}, SETTLE),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start minutes/ }),
    ).not.toBeInTheDocument();
  });

  test("renders one notes box per snapshot item, plus the closing notes", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes({ notes: { opening: "Quorum at 18:04." } }),
    }));
    renderTab();

    expect(
      await screen.findByLabelText("Notes for Opening", {}, SETTLE),
    ).toHaveValue("Quorum at 18:04.");
    expect(
      screen.getByLabelText("Notes for Finance & Fundraising"),
    ).toHaveValue("");
    expect(screen.getByLabelText("Notes for Next meeting")).toBeInTheDocument();
    expect(screen.getByLabelText("Closing notes")).toBeInTheDocument();

    // The plan comes from the frozen snapshot, not the live agenda.
    expect(screen.getByText(/Grant report due/)).toBeInTheDocument();
  });

  test("saves a note and shows the save on the status line", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes(),
    }));
    renderTab();

    const box = await screen.findByLabelText("Notes for Opening", {}, SETTLE);
    await act(async () => {
      fireEvent.change(box, { target: { value: "Quorum at 18:04." } });
    });
    // Blur is a flush point, so the assertion doesn't wait out the debounce.
    await act(async () => {
      fireEvent.blur(box);
    });

    await waitFor(
      () => expect(saveMinutesDraftAction).toHaveBeenCalledTimes(1),
      SETTLE,
    );
    // Only the key that changed: the RPC merges per key, so sending the rest
    // would let a stale copy of another section overwrite it.
    expect(saveMinutesDraftAction).toHaveBeenLastCalledWith("meeting-1", {
      notes: { opening: "Quorum at 18:04." },
    });
    expect(await screen.findByText(/^Saved /, {}, SETTLE)).toBeInTheDocument();
  });

  test("publishes a flush the tab strip can await, and withdraws it on unmount", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes(),
    }));
    const guardRef = renderTab();

    await screen.findByLabelText("Notes for Opening", {}, SETTLE);
    await waitFor(() => expect(guardRef.current).not.toBeNull(), SETTLE);
    await expect(guardRef.current?.flush()).resolves.toBe(true);
  });

  test("renders finalized minutes read-only, with a way back to draft", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes({
        status: "final",
        finalized_at: "2026-09-01T20:00:00.000Z",
        notes: { opening: "Quorum at 18:04." },
        body_text: "Adjourned 19:30.",
      }),
    }));
    renderTab();

    expect(await screen.findByText("Final", {}, SETTLE)).toBeInTheDocument();
    expect(screen.getByText("Quorum at 18:04.")).toBeInTheDocument();
    expect(screen.getByText("Adjourned 19:30.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Notes for Opening"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });

  test("renders a draft read-only for a viewer without manage access", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes({ notes: { opening: "Quorum at 18:04." } }),
    }));
    renderTab(false);

    expect(await screen.findByText("Draft", {}, SETTLE)).toBeInTheDocument();
    expect(screen.getByText("Quorum at 18:04.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Notes for Opening"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reopen" }),
    ).not.toBeInTheDocument();
  });

  test("captures an action item against a section without leaving the tab", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes(),
    }));
    renderTab();

    await screen.findByLabelText("Notes for Opening", {}, SETTLE);
    const addButtons = screen.getAllByRole("button", {
      name: "+ Add action item",
    });
    // One per snapshot item, so an action raised while discussing a section is
    // recorded against it rather than by scrolling somewhere else.
    expect(addButtons).toHaveLength(3);

    await act(async () => {
      addButtons[1].click();
    });

    expect(
      await screen.findByText(
        "Recorded under Finance & Fundraising.",
        {},
        SETTLE,
      ),
    ).toBeInTheDocument();
  });

  test("finalizes behind a confirmation", async () => {
    getMinutesAction.mockImplementation(async () => ({
      data: draftMinutes(),
    }));
    renderTab();

    const finalize = await screen.findByRole(
      "button",
      { name: "Finalize" },
      SETTLE,
    );
    await act(async () => {
      finalize.click();
    });

    expect(
      await screen.findByText("Finalize these minutes?", {}, SETTLE),
    ).toBeInTheDocument();
    expect(finalizeMinutesAction).not.toHaveBeenCalled();

    await act(async () => {
      screen.getAllByRole("button", { name: "Finalize" }).at(-1)?.click();
    });
    await waitFor(
      () => expect(finalizeMinutesAction).toHaveBeenCalledWith("meeting-1"),
      SETTLE,
    );
  });
});
