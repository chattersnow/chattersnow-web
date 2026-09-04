import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
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
    event_type: null,
    venue: null,
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
    program_id: null,
    flier_url: null,
    ...overrides,
  };
}

// The Save button lives on the event detail view's toolbar, wired to the tab's
// form by id -- stand in for it here.
function renderTab(event: EventRow, mode: "view" | "edit" = "edit") {
  return render(
    <>
      <OverviewTab
        event={event}
        programs={[]}
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

// Issue #655: both columns were held in form state and submitted with no
// control rendered, so neither could be seen or corrected after creation --
// while the public event pages were displaying them the whole time.
describe("OverviewTab event type and venue", () => {
  beforeEach(() => {
    updateEventActionMock.mockClear();
    updateEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("shows the stored values read-only in view mode", () => {
    renderTab(
      makeEvent({ event_type: "gear_swap", venue: "Community Center" }),
      "view",
    );

    expect(screen.getByText("Gear swap")).toBeInTheDocument();
    expect(screen.getByText("Community Center")).toBeInTheDocument();
  });

  test("submits an edited type and venue", async () => {
    const user = userEvent.setup();
    renderTab(
      makeEvent({ event_type: "gear_swap", venue: "Community Center" }),
    );

    await user.clear(screen.getByLabelText("Venue / mountain"));
    await user.type(screen.getByLabelText("Venue / mountain"), "Bear Mountain");

    const trigger = screen.getByRole("combobox", { name: "Event type" });
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Fundraiser" }));
    await waitFor(() => expect(trigger).toHaveTextContent("Fundraiser"));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEventActionMock).toHaveBeenCalledTimes(1));
    const submitted = updateEventActionMock.mock.calls[0][1];
    expect(submitted.get("eventType")).toBe("fundraiser");
    expect(submitted.get("venue")).toBe("Bear Mountain");
  });

  test("keeps a type outside the curated list selectable", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ event_type: "Access Day" }));

    const trigger = screen.getByRole("combobox", { name: "Event type" });
    expect(trigger).toHaveTextContent("Access Day");

    await user.click(trigger);
    expect(
      await screen.findByRole("option", { name: "Access Day" }),
    ).toBeInTheDocument();
  });

  test("stays read-only once the report is submitted", () => {
    renderTab(
      makeEvent({ report_status: "submitted", venue: "Community Center" }),
      "edit",
    );

    expect(screen.getByText("Community Center")).toBeInTheDocument();
    expect(screen.queryByLabelText("Venue / mountain")).toBeNull();
  });
});
