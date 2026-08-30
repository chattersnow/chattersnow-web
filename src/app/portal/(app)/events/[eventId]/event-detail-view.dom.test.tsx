import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import * as PeopleActions from "../../people/actions";
import * as VolunteersActions from "../volunteers-actions";
import * as ShiftsActions from "../shifts-actions";
import * as SponsorsActions from "../sponsors-actions";
import * as RegistrantsActions from "../registrants-actions";
import * as DiscountCodesActions from "../discount-codes-actions";
import * as DistributionActions from "../../home/distribution-actions";
import * as IncidentsActions from "../incidents-actions";
import * as GiveawayActions from "../giveaway-actions";
import * as ExpensesActions from "../../finance/expenses/actions";
import * as RevenueActions from "../../finance/revenue/actions";
import * as ImpactActions from "../impact-actions";
import * as HomeActions from "../../home/actions";
import * as LogisticsActions from "../logistics-actions";
import * as RoleTypesActions from "../../volunteers/roles/actions";
import * as EventsActions from "../actions";
import type { EventRow } from "../event-badges";

mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: mock(async () => ({ data: [] })),
}));
mock.module("../volunteers-actions", () => ({
  ...VolunteersActions,
  listEventVolunteersAction: mock(async () => ({ data: [] })),
  listEventVolunteerHoursAction: mock(async () => ({ data: [] })),
}));
mock.module("../shifts-actions", () => ({
  ...ShiftsActions,
  listEventShiftsAction: mock(async () => ({ data: [] })),
}));
mock.module("../sponsors-actions", () => ({
  ...SponsorsActions,
  listEventSponsorsAction: mock(async () => ({ data: [] })),
}));
mock.module("../registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: mock(async () => ({ data: [] })),
}));
mock.module("../discount-codes-actions", () => ({
  ...DiscountCodesActions,
  listDiscountCodesAction: mock(async () => ({ data: [] })),
}));
mock.module("../../home/distribution-actions", () => ({
  ...DistributionActions,
  listEventDistributionsAction: mock(async () => ({ data: [] })),
}));
mock.module("../incidents-actions", () => ({
  ...IncidentsActions,
  listEventIncidentsAction: mock(async () => ({ data: [] })),
}));
mock.module("../giveaway-actions", () => ({
  ...GiveawayActions,
  getEventGiveawayAction: mock(async () => ({ data: null })),
}));
mock.module("../../finance/expenses/actions", () => ({
  ...ExpensesActions,
  listEventExpensesAction: mock(async () => ({ data: [] })),
  getExpenseApprovalContextAction: mock(async () => ({
    data: {
      userId: null,
      canApprove: false,
      canSelfApprove: false,
      canMarkPaid: false,
      threshold: null,
    },
  })),
}));
mock.module("../../finance/revenue/actions", () => ({
  ...RevenueActions,
  listEventRevenueAction: mock(async () => ({ data: [] })),
}));
mock.module("../impact-actions", () => ({
  ...ImpactActions,
  getEventImpactAction: mock(async () => ({ data: null })),
}));
mock.module("../../home/actions", () => ({
  ...HomeActions,
  listEventDonationsAction: mock(async () => ({ data: [] })),
}));
mock.module("../logistics-actions", () => ({
  ...LogisticsActions,
  getEventLogisticsAction: mock(async () => ({ data: null })),
}));
mock.module("../../volunteers/roles/actions", () => ({
  ...RoleTypesActions,
  listRoleTypesAction: mock(async () => ({ data: [] })),
}));
mock.module("../actions", () => ({
  ...EventsActions,
  listEventLeadsAction: mock(async () => ({ data: [] })),
}));

const { EventDetailView } = await import("./event-detail-view");

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
    budget_amount: null,
    event_lead_id: null,
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

describe("EventDetailView", () => {
  test("shows one phase tab bar: Overview, Planning, During, After", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} canManage={true} />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(4);
    for (const label of [/Overview/, /Planning/, /During/, /After/]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Winter Gear Swap" }),
    ).toBeInTheDocument();
    // Overview is the default tab; its card is visible, other phases aren't.
    expect(screen.getByText("Event details")).toBeInTheDocument();
    expect(
      screen.queryByText("Registration & planning"),
    ).not.toBeInTheDocument();
  });

  test("switches phases through the tab bar", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} canManage={true} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));

    expect(screen.getByText("Registration & planning")).toBeInTheDocument();
    expect(screen.getByText("Logistics")).toBeInTheDocument();
    expect(screen.getByText("Volunteers")).toBeInTheDocument();
    expect(screen.getByText("Sponsors")).toBeInTheDocument();
    expect(screen.queryByText("Event details")).not.toBeInTheDocument();
  });

  test("edits inline per card, without an edit sheet", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} canManage={true} />,
    );

    expect(
      screen.getByRole("button", { name: "Edit event details" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));
    expect(
      screen.getByRole("button", { name: "Edit registration & planning" }),
    ).toBeInTheDocument();
  });

  test("hides edit controls without manage access", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} canManage={false} />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit event details" }),
    ).not.toBeInTheDocument();
  });

  test("hides edit for report-locked cards after report submission", () => {
    render(
      <EventDetailView
        event={makeEvent({ report_status: "submitted" })}
        programs={[]}
        canManage={true}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit event details" }),
    ).not.toBeInTheDocument();
  });

  test("opens the phase for a deep-linked tab", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        initialTab="registrants"
      />,
    );

    expect(screen.getByText("Registrants")).toBeInTheDocument();
    expect(screen.queryByText("Event details")).not.toBeInTheDocument();
  });
});
