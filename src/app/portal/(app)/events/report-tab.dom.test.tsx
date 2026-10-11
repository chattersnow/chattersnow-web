import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EventRow } from "./event-badges";
import * as EventsActions from "./actions";
import { labelText } from "../../../../../test/labels";
import type { EventReport } from "@/lib/portal/event-report-metrics";

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

const emptyMoney = {
  incomeStreams: [],
  income: 0,
  salesTax: 0,
  expensesByStatus: [],
  reimbursementsByStatus: [],
  paidSpend: 0,
  committedSpend: 0,
  pendingSpend: 0,
  net: 0,
  budget: null,
  budgetRemaining: null,
};

const emptyReport = async () => ({
  data: {
    money: emptyMoney,
    goods: null,
    sponsors: null,
    team: null,
    operations: { incidents: 0, bySeverity: {} },
  } satisfies EventReport,
});

const getEventReportActionMock =
  mock<(eventId: string) => Promise<{ data: EventReport }>>(emptyReport);

mock.module("./report-data-actions", () => ({
  getEventReportAction: getEventReportActionMock,
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

describe("ReportTab", () => {
  beforeEach(() => {
    getEventReportActionMock.mockImplementation(emptyReport);
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

    fireEvent.change(screen.getByLabelText(labelText("Reason")), {
      target: { value: "Capacity needs correcting after the fact." },
    });
    fireEvent.click(submitButton);

    expect(reopenEventReportActionMock).toHaveBeenCalledWith(
      "event-1",
      "Capacity needs correcting after the fact.",
    );
  });

  // #1576: the summary is computed, not typed.
  test("shows computed sections the reader may see, and no summary textarea", async () => {
    getEventReportActionMock.mockImplementation(async () => ({
      data: {
        money: {
          ...emptyMoney,
          incomeStreams: [{ key: "ticket_sales", count: 2, total: 300 }],
          income: 300,
          net: 300,
        },
        goods: null,
        sponsors: null,
        team: null,
        operations: { incidents: 1, bySeverity: { minor: 1 } },
      },
    }));

    render(
      <ReportTab
        event={makeEvent()}
        formId="report-form"
        mode="edit"
        onSaved={() => {}}
      />,
    );

    const money = await screen.findByRole("region", { name: "Money" });
    expect(money).toHaveTextContent("Ticket sales");
    expect(money).toHaveTextContent("$300.00");
    expect(
      screen.getByRole("region", { name: "Operations" }),
    ).toHaveTextContent("1 minor");
    // Sections the RPC returned null for are not rendered at all.
    expect(screen.queryByRole("region", { name: "Goods" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Sponsors" })).toBeNull();
    expect(screen.queryByLabelText(/report summary/i)).toBeNull();
  });

  test("says so when a visible section has nothing recorded", async () => {
    render(
      <ReportTab
        event={makeEvent()}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText(
        "No income, expenses or budget recorded for this event.",
      ),
    ).toBeInTheDocument();
  });

  test("keeps an old typed summary readable", async () => {
    render(
      <ReportTab
        event={makeEvent({ report_summary: "Great turnout despite the snow." })}
        formId="report-form"
        mode="view"
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText("Great turnout despite the snow."),
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier written summary")).toBeInTheDocument();
  });
});
