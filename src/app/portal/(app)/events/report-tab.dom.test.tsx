import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";

type ActionResult = { error: string } | { success: true };

const getCanReopenEventReportActionMock = mock<
  () => Promise<{ data: { canReopen: boolean } }>
>(async () => ({ data: { canReopen: false } }));
const reopenEventReportActionMock = mock<
  (id: string, reason: string) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventsActions,
  getCanReopenEventReportAction: getCanReopenEventReportActionMock,
  reopenEventReportAction: reopenEventReportActionMock,
}));

const { ReportTab } = await import("./report-tab");

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

describe("ReportTab", () => {
  beforeEach(() => {
    getCanReopenEventReportActionMock.mockClear();
    reopenEventReportActionMock.mockClear();
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: false },
    }));
    reopenEventReportActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("hides the reopen button for a non-admin, even once the report is submitted", async () => {
    render(
      <ReportTab
        event={makeEvent({ report_status: "submitted" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    await screen.findByText(/submitted/i);
    expect(
      screen.queryByRole("button", { name: "Reopen report" }),
    ).not.toBeInTheDocument();
  });

  test("hides the reopen button while the report isn't submitted, even for an admin", () => {
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: true },
    }));

    render(
      <ReportTab
        event={makeEvent({ report_status: "in_progress" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Reopen report" }),
    ).not.toBeInTheDocument();
  });

  test("lets an admin reopen a submitted report after giving a reason", async () => {
    getCanReopenEventReportActionMock.mockImplementation(async () => ({
      data: { canReopen: true },
    }));

    render(
      <ReportTab
        event={makeEvent({ report_status: "submitted" })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    const reopenButton = await screen.findByRole("button", {
      name: "Reopen report",
    });
    fireEvent.click(reopenButton);

    const submitButton = screen
      .getAllByRole("button", { name: "Reopen report" })
      .find((button) => button.getAttribute("type") === "submit")!;

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Capacity needs correcting after the fact." },
    });
    fireEvent.click(submitButton);

    expect(reopenEventReportActionMock).toHaveBeenCalledWith(
      "event-1",
      "Capacity needs correcting after the fact.",
    );
  });
});
