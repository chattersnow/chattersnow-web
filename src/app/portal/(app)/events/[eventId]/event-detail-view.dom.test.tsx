import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
  test("shows every phase flat, without tabs", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} eventLeads={[]} />,
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    for (const label of ["Planning", "During", "After"]) {
      expect(
        screen.getByRole("heading", { name: label, level: 2 }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Event details")).toBeInTheDocument();
    expect(screen.getByText("Registration & planning")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Winter Gear Swap" }),
    ).toBeInTheDocument();
  });

  test("editing happens through a sheet", () => {
    render(
      <EventDetailView event={makeEvent()} programs={[]} eventLeads={[]} />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
