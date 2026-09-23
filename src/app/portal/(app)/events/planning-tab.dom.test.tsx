import { pinTimezone } from "../../../../../test/timezone";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

// The deadline field is a datetime-local input, so every expectation below is
// the fixture's instant read in the *process* zone, and the fixture is written
// as New York wall-clock times. This file never said so: until #1170 it
// inherited the zone from event-date-defaults.dom.test.tsx, which pinned New
// York and never handed it back, and the two happened to land in that order.
// Sharding the suite separated them and every assertion here came out four
// hours off.
pinTimezone("America/New_York");

type ActionResult = { error: string } | { success: true };

const updateEventPlanningActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  updateEventPlanningAction: updateEventPlanningActionMock,
}));

const { PlanningTab } = await import("./planning-tab");

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "Winter Gear Swap",
    location: "HQ",
    // 10:00-14:00 in America/New_York.
    starts_at: "2026-09-01T14:00:00.000Z",
    ends_at: "2026-09-01T18:00:00.000Z",
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

// The Save button lives on the event detail view's toolbar, wired to the tab's
// form by id -- stand in for it here.
function renderTab(event: EventRow) {
  return render(
    <>
      <PlanningTab
        event={event}
        formId="planning-form"
        people={[]}
        onPersonCreated={() => {}}
        mode="edit"
        onSaved={() => {}}
      />
      <button type="submit" form="planning-form">
        Save
      </button>
    </>,
  );
}

const deadlineField = () => screen.getByLabelText("Registration deadline");
const registrationToggle = () =>
  screen.getByRole("checkbox", { name: "Registration enabled" });

describe("PlanningTab registration deadline", () => {
  beforeEach(() => {
    updateEventPlanningActionMock.mockClear();
    updateEventPlanningActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("disables the deadline while registration is off", () => {
    renderTab(makeEvent());
    expect(deadlineField()).toBeDisabled();
  });

  test("enables the deadline and caps it at the event end", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());

    expect(deadlineField()).toBeEnabled();
    expect(deadlineField()).toHaveAttribute("max", "2026-09-01T14:00");
  });

  test("defaults a blank deadline to the event end date", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());

    expect(deadlineField()).toHaveValue("2026-09-01T14:00");
  });

  test("falls back to the start date when the event has no end", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ ends_at: null }));

    await user.click(registrationToggle());

    expect(deadlineField()).toHaveValue("2026-09-01T10:00");
    expect(deadlineField()).toHaveAttribute("max", "2026-09-01T10:00");
  });

  test("shows a stored deadline rather than the default", () => {
    renderTab(
      makeEvent({
        registration_enabled: true,
        registration_deadline: "2026-08-25T14:00:00.000Z",
      }),
    );

    expect(deadlineField()).toBeEnabled();
    expect(deadlineField()).toHaveValue("2026-08-25T10:00");
  });

  test("submits a deadline the user picked, not the default", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent());

    await user.click(registrationToggle());
    await user.clear(deadlineField());
    await user.type(deadlineField(), "2026-08-25T10:00");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventPlanningActionMock.mock.calls[0][1];
    expect(submitted.get("registrationEnabled")).toBe("on");
    expect(submitted.get("registrationDeadline")).toBe(
      "2026-08-25T14:00:00.000Z",
    );
  });

  test("clears the deadline when registration is switched off", async () => {
    const user = userEvent.setup();
    renderTab(
      makeEvent({
        registration_enabled: true,
        registration_deadline: "2026-08-25T14:00:00.000Z",
      }),
    );

    await user.click(registrationToggle());

    expect(deadlineField()).toBeDisabled();
    expect(deadlineField()).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    const submitted = updateEventPlanningActionMock.mock.calls[0][1];
    expect(submitted.get("registrationEnabled")).toBe("off");
    expect(submitted.get("registrationDeadline")).toBe("");
  });
});

describe("PlanningTab adults only (#1417)", () => {
  beforeEach(() => updateEventPlanningActionMock.mockClear());

  const adultsOnlySwitch = () =>
    screen.getByRole("switch", { name: /Adults only \(18\+\)/ });

  test("starts from the stored value and saves the change", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ adults_only: false }));

    expect(adultsOnlySwitch()).not.toBeChecked();
    await user.click(adultsOnlySwitch());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    expect(
      updateEventPlanningActionMock.mock.calls[0][1].get("adultsOnly"),
    ).toBe("on");
  });

  test("an 18+ event shows it on and can turn it off", async () => {
    const user = userEvent.setup();
    renderTab(makeEvent({ adults_only: true }));

    expect(adultsOnlySwitch()).toBeChecked();
    await user.click(adultsOnlySwitch());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEventPlanningActionMock).toHaveBeenCalledTimes(1),
    );
    expect(
      updateEventPlanningActionMock.mock.calls[0][1].get("adultsOnly"),
    ).toBe("off");
  });
});
