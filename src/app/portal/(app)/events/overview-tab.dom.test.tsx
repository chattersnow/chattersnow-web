import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import type { Program } from "../programs/actions";
import * as EventsActions from "./actions";

type ActionResult = { error: string } | { success: true };

const updateEventActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventAction: updateEventActionMock,
}));

const { OverviewTab } = await import("./overview-tab");

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
    starts_at: "2026-09-01T18:00:00.000Z",
    ends_at: null,
    timezone: "America/New_York",
    visibility: "public",
    status: "published",
    attendance_count: null,
    attendance_notes: null,
    description: null,
    capacity: null,
    registration_enabled: false,
    registration_deadline: null,
    auto_assign_discount_codes: false,
    budget_amount: null,
    event_lead_id: null,
    event_lead: null,
    report_status: "not_started",
    report_summary: null,
    lessons_learned: null,
    feedback_notes: null,
    content_notes: null,
    report_submitted_at: null,
    report_submitted_by: null,
    program_ids: [],
    flier_url: null,
    ...overrides,
  };
}

const PROGRAMS: Program[] = [
  { id: "program-1", name: "Winter Access", status: "active" },
  { id: "program-2", name: "Gear Library", status: "active" },
];

// The Save button lives on the event detail view's toolbar, wired to the tab's
// form by id -- stand in for it here.
function renderTab(
  event: EventRow,
  mode: "view" | "edit" = "edit",
  programs: Program[] = PROGRAMS,
) {
  return render(
    <>
      <OverviewTab
        event={event}
        programs={programs}
        formId="overview-form"
        mode={mode}
        onSaved={() => {}}
      />
      <button type="submit" form="overview-form">
        Save
      </button>
    </>,
  );
}

// An event can count toward more than one program's impact report -- a single
// access day serving both the mountain-access and the gear program has to show
// up in both. The single program_id this replaced could only ever pick one.
describe("OverviewTab programs", () => {
  beforeEach(() => {
    updateEventActionMock.mockClear();
    updateEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("lists every linked program in view mode", () => {
    renderTab(makeEvent({ program_ids: ["program-1", "program-2"] }), "view");

    expect(screen.getByText("Winter Access, Gear Library")).toBeInTheDocument();
  });

  test("shows a dash when the event belongs to no program", () => {
    renderTab(makeEvent(), "view");

    expect(screen.getByText("Programs")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  test("submits every checked program", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ program_ids: ["program-1"] }));

    await user.click(screen.getByRole("checkbox", { name: "Gear Library" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    const submitted = updateEventActionMock.mock.calls[0][1];
    expect(submitted.getAll("programIds")).toEqual(["program-1", "program-2"]);
  });

  test("submits an empty list when the last program is unchecked", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ program_ids: ["program-1"] }));

    await user.click(screen.getByRole("checkbox", { name: "Winter Access" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    expect(updateEventActionMock.mock.calls[0][1].getAll("programIds")).toEqual(
      [],
    );
  });

  test("reports the form dirty only once the selection actually changes", async () => {
    const user = userEvent.setup();
    const onDirtyChange = mock((_dirty: boolean) => {});
    render(
      <OverviewTab
        event={makeEvent({ program_ids: ["program-1"] })}
        programs={PROGRAMS}
        formId="overview-form"
        mode="edit"
        onSaved={() => {}}
        onDirtyChange={onDirtyChange}
      />,
    );

    // program_ids is an array, so a reference comparison would report the form
    // dirty on the very first render, before anything was touched.
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalled());
    expect(onDirtyChange.mock.calls.at(-1)?.[0]).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "Gear Library" }));
    await waitFor(() =>
      expect(onDirtyChange.mock.calls.at(-1)?.[0]).toBe(true),
    );
  });

  test("stays read-only once the report is submitted", () => {
    renderTab(
      makeEvent({ report_status: "submitted", program_ids: ["program-1"] }),
      "edit",
    );

    expect(screen.getByText("Winter Access")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Winter Access" }),
    ).toBeNull();
  });
});
