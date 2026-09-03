import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PermissionMap } from "@/lib/auth/permissions";
import * as EventActions from "./events/actions";
import * as PeopleActions from "./people/actions";
import * as ProgramActions from "./programs/actions";

// Every quick-action dialog loads its own option data on open, and the sidebar
// passes none of it down. Nothing here opens a dialog, but the modules are
// imported, so their list actions need stubbing -- spread the real modules so
// the create actions the dialogs also import stay in place.
mock.module("./programs/actions", () => ({
  ...ProgramActions,
  listProgramsAction: async () => ({ data: [] }),
}));
mock.module("./events/actions", () => ({
  ...EventActions,
  listEventOptionsAction: async () => ({ data: [] }),
}));
mock.module("./people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: async () => ({ data: [] }),
}));

const { SidebarQuickActions } = await import("./sidebar-quick-actions");

const ALL_ACTIONS = [
  /record gear donation/i,
  /record distribution/i,
  /log volunteer hours/i,
  /add expense/i,
  /log donation/i,
  /new event/i,
];

function visibleActions(permissions: PermissionMap) {
  render(<SidebarQuickActions permissions={permissions} />);
  return ALL_ACTIONS.filter(
    (name) => screen.queryAllByRole("button", { name }).length > 0,
  ).map((name) => name.source);
}

describe("SidebarQuickActions", () => {
  test("renders nothing with no permissions", () => {
    const { container } = render(<SidebarQuickActions permissions={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing for a board member", () => {
    const { container } = render(
      <SidebarQuickActions
        permissions={{
          governance: "manage",
          finance_reports: "view",
          reimbursement_approvals: "manage",
          finance_approvals: "manage",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("shows the three field actions for a volunteer", () => {
    expect(
      visibleActions({
        events: "view",
        volunteers: "view",
        programs: "view",
        inventory_intake: "manage",
        volunteer_hours_logging: "manage",
      }),
    ).toEqual([
      "record gear donation",
      "record distribution",
      "log volunteer hours",
    ]);
  });

  test("shows event and expense actions for an event coordinator", () => {
    expect(
      visibleActions({
        events: "manage",
        event_expenses: "manage",
        programs: "manage",
        volunteers: "view",
      }),
    ).toEqual(["add expense", "new event"]);
  });

  test("shows the money actions -- and not gear intake -- for finance", () => {
    expect(
      visibleActions({
        finance: "manage",
        event_expenses: "manage",
        events: "view",
        reimbursements: "manage",
        finance_reports: "view",
      }),
    ).toEqual(["add expense", "log donation"]);
  });

  test("shows every action for an admin", () => {
    expect(
      visibleActions({
        events: "manage",
        event_expenses: "manage",
        finance: "manage",
        inventory: "manage",
        inventory_intake: "manage",
        volunteers: "manage",
        volunteer_hours_logging: "manage",
      }),
    ).toEqual([
      "record gear donation",
      "record distribution",
      "log volunteer hours",
      "add expense",
      "log donation",
      "new event",
    ]);
  });
});
