import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import * as PeopleActions from "../../people/actions";
import * as VolunteersActions from "../volunteers-actions";
import * as ShiftsActions from "../shifts-actions";
import * as SponsorsActions from "../sponsors-actions";
import * as StaffActions from "../staff-actions";
import * as RegistrantsActions from "../registrants-actions";
import * as DiscountCodesActions from "../discount-codes-actions";
import * as DistributionActions from "../../home/distribution-actions";
import * as IncidentsActions from "../incidents-actions";
import * as ChecklistActions from "../checklist-actions";
import * as GiveawayActions from "../giveaway-actions";
import * as ExpensesActions from "../../finance/expenses/actions";
import * as RevenueActions from "../../finance/revenue/actions";
import * as ImpactActions from "../impact-actions";
import * as ImpactDerivedActions from "../impact-derived-actions";
import * as HomeActions from "../../home/actions";
import * as LogisticsActions from "../logistics-actions";
import * as RoleTypesActions from "../../volunteers/roles/actions";
import * as EventsActions from "../actions";
import type { EventRow } from "../event-badges";
import { mockUrlTabState } from "@/../test/url-tab-state-mock";

mockUrlTabState();

// The reads the phase provider owns (event-phase-data.tsx) are held by name so
// the tests below can count how many times opening a phase fetches each one.
const listPeopleActionMock = mock(async () => ({ data: [] }));
const listEventRegistrantsActionMock = mock(async () => ({ data: [] }));
const getEventImpactDerivedActionMock = mock(async () => ({
  data: {
    participants: 0,
    checkedIn: 0,
    firstTimeParticipants: 0,
    recurringParticipants: 0,
    volunteerParticipants: 0,
    beginnerParticipants: 0,
    profiledAttendees: 0,
    discountCodesAssigned: 0,
    autoAssignDiscountCodes: false,
  },
}));

mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
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
mock.module("../staff-actions", () => ({
  ...StaffActions,
  listEventStaffAction: mock(async () => ({ data: [] })),
}));
mock.module("../registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
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
mock.module("../checklist-actions", () => ({
  ...ChecklistActions,
  listEventChecklistItemsAction: mock(async () => ({ data: [] })),
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
mock.module("../impact-derived-actions", () => ({
  ...ImpactDerivedActions,
  getEventImpactDerivedAction: getEventImpactDerivedActionMock,
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
  getCanReopenEventReportAction: mock(async () => ({
    data: { canReopen: false },
  })),
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

describe("EventDetailView", () => {
  test("shows one phase tab bar: Overview, Planning, During, After", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
      />,
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
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
      />,
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
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
      />,
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

  test("puts a card's create actions in that card, not a shared strip", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));

    // The actions used to be merged into one row beside the phase tabs, which
    // left the operator scrolling back up past three cards to reach them.
    const addVolunteer = screen.getByRole("button", {
      name: "+ Add volunteer",
    });
    const card = addVolunteer.closest("[data-slot=card]");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("Volunteers");
    expect(card).not.toHaveTextContent("Sponsors");

    const strip = screen.getByRole("tablist").parentElement;
    expect(strip?.querySelectorAll("button:not([role=tab])")).toHaveLength(0);
  });

  test("hides create actions without manage access", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={false}
        deleteBlockers={[]}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));

    expect(
      screen.queryByRole("button", { name: "+ Add volunteer" }),
    ).not.toBeInTheDocument();
  });

  test("hides edit controls without manage access", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={false}
        deleteBlockers={[]}
      />,
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
        deleteBlockers={[]}
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
        deleteBlockers={[]}
        initialTab="registrants"
      />,
    );

    expect(screen.getByText("Registrants")).toBeInTheDocument();
    expect(screen.queryByText("Event details")).not.toBeInTheDocument();
  });

  test("counts a phase's outstanding tasks on its tab, and names them", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
        phaseTasks={{
          basic: [],
          planning: ["Planning incomplete"],
          during: ["Attendance not logged"],
          after: ["After-report not started", "Impact not recorded"],
        }}
      />,
    );

    expect(screen.getByLabelText("2 outstanding")).toHaveAttribute(
      "title",
      "After-report not started, Impact not recorded",
    );
    expect(screen.getAllByLabelText("1 outstanding")).toHaveLength(2);
  });

  describe("shared phase reads", () => {
    beforeEach(() => {
      listPeopleActionMock.mockClear();
      listEventRegistrantsActionMock.mockClear();
      getEventImpactDerivedActionMock.mockClear();
    });

    test("fetches each shared read once per phase, not once per card", () => {
      render(
        <EventDetailView
          event={makeEvent()}
          programs={[]}
          canManage={true}
          deleteBlockers={[]}
        />,
      );

      // Planning holds the Planning and Sponsors cards, which both want people.
      fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));
      expect(listPeopleActionMock).toHaveBeenCalledTimes(1);

      // During holds Registrants + Discount codes (registrants) and
      // Attendance + Registrants (the derived figures).
      fireEvent.click(screen.getByRole("tab", { name: /During/ }));
      expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
      expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(1);
    });

    test("skips the reads a phase's cards don't ask for", () => {
      render(
        <EventDetailView
          event={makeEvent()}
          programs={[]}
          canManage={true}
          deleteBlockers={[]}
        />,
      );

      // Overview is the default phase and shares nothing.
      expect(listPeopleActionMock).not.toHaveBeenCalled();
      expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
      expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("tab", { name: /Planning/ }));
      expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
    });
  });

  test("shows no badge on a phase with nothing outstanding", () => {
    render(
      <EventDetailView
        event={makeEvent()}
        programs={[]}
        canManage={true}
        deleteBlockers={[]}
        phaseTasks={{ basic: [], planning: [], during: [], after: [] }}
      />,
    );

    expect(screen.queryByLabelText(/outstanding/)).not.toBeInTheDocument();
  });
});
