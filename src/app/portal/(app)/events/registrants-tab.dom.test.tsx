import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRegistrant } from "./registrants-actions";
import * as RegistrantsActions from "./registrants-actions";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import type { TabData } from "@/hooks/use-tab-data";

type ActionResult = { error: string } | { success: true };

const registrants: EventRegistrant[] = [
  {
    id: "reg-1",
    event_id: "event-1",
    name: "Jamie Rivera",
    email: "jamie@example.test",
    phone: null,
    party_size: 2,
    notes: null,
    created_at: "2026-08-01T12:00:00Z",
    person_id: "person-1",
    checked_in_at: null,
    rider: {
      riding_discipline_at_event: null,
      ski_experience_level_at_event: null,
      snowboard_experience_level_at_event: null,
      riding_discipline: null,
      ski_experience_level: null,
      snowboard_experience_level: null,
      preferred_mountain: null,
    },
  },
  {
    id: "reg-2",
    event_id: "event-1",
    name: "Alex Chen",
    email: "alex@example.test",
    phone: null,
    party_size: 1,
    notes: null,
    created_at: "2026-08-01T12:05:00Z",
    person_id: "person-2",
    checked_in_at: "2026-08-28T09:00:00Z",
    rider: {
      riding_discipline_at_event: "snowboard",
      ski_experience_level_at_event: null,
      snowboard_experience_level_at_event: "beginner",
      riding_discipline: "both",
      ski_experience_level: "advanced",
      snowboard_experience_level: "advanced",
      preferred_mountain: "Hunter",
    },
  },
];

const derivedFigures: EventImpactDerived = {
  participants: 1,
  checkedIn: 1,
  firstTimeParticipants: 1,
  recurringParticipants: 0,
  volunteerParticipants: 0,
  beginnerParticipants: null,
  profiledAttendees: null,
  discountCodesAssigned: null,
  autoAssignDiscountCodes: false,
};

const checkInRegistrantActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);
const undoCheckInActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  checkInRegistrantAction: checkInRegistrantActionMock,
  undoCheckInAction: undoCheckInActionMock,
}));

const { RegistrantsTab } = await import("./registrants-tab");

// The card no longer fetches -- the phase provider does (event-phase-data.tsx)
// -- so the tests hand it the same slices the provider would.
const refreshRegistrants = mock(() => {});
const refreshDerived = mock(() => {});

function slices(): {
  registrants: TabData<EventRegistrant[]>;
  derived: TabData<EventImpactDerived>;
} {
  return {
    registrants: {
      data: registrants,
      loadError: null,
      refresh: refreshRegistrants,
    },
    derived: {
      data: derivedFigures,
      loadError: null,
      refresh: refreshDerived,
    },
  };
}

describe("RegistrantsTab", () => {
  beforeEach(() => {
    checkInRegistrantActionMock.mockClear();
    undoCheckInActionMock.mockClear();
    refreshRegistrants.mockClear();
    refreshDerived.mockClear();
  });

  test("displays registrants with summary counts", async () => {
    render(<RegistrantsTab capacity={10} mode="view" {...slices()} />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "2 registrations, 3 attending of 10 capacity · 1 checked in · 0 recurring, 1 first-time",
      ),
    ).toBeInTheDocument();
  });

  test("Rides shows the level snapshotted at check-in, not the current profile", async () => {
    render(<RegistrantsTab capacity={null} mode="view" {...slices()} />);
    await screen.findByText("Alex Chen");

    // Alex now rides both at advanced, but was a snowboard beginner on the day.
    expect(screen.getByText("Snowboard · Beginner")).toBeInTheDocument();
    expect(screen.queryByText(/Both/)).toBeNull();
  });

  test("view mode hides check-in controls", async () => {
    render(<RegistrantsTab capacity={null} mode="view" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  test("checks in a registrant and shows undo for an already checked-in one", async () => {
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(
      screen.getByRole("button", { name: "Undo check-in" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(checkInRegistrantActionMock).toHaveBeenCalledWith("reg-1");
    // Checking someone in changes the derived figures too, so both shared
    // reads have to be refreshed, not just the registrant list.
    expect(refreshRegistrants).toHaveBeenCalled();
    expect(refreshDerived).toHaveBeenCalled();
  });

  test("undoing a check-in calls undoCheckInAction", async () => {
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Alex Chen");

    await user.click(screen.getByRole("button", { name: "Undo check-in" }));

    expect(undoCheckInActionMock).toHaveBeenCalledWith("reg-2");
  });
  test("caps the card at previewRows and defers the rest to a sheet", async () => {
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Alex Chen")).toBeNull();
    expect(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    ).toBeInTheDocument();
  });

  test("no View all trigger when the list already fits", async () => {
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  test("previewRows null renders the whole list with no trigger", async () => {
    // What the Happening Now check-in sheet passes: capping there would hide
    // the rows it exists to work through, and the trigger would open a sheet
    // on top of a sheet.
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={null}
        {...slices()}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  test("the sheet lists every registrant and carries the toolbar actions", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        headerActions={<button type="button">+ Add registrant</button>}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");

    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(sheet.getByText("Alex Chen")).toBeInTheDocument();
    expect(
      sheet.getByRole("button", { name: "+ Add registrant" }),
    ).toBeInTheDocument();
  });

  test("searching inside the sheet narrows rows and announces the count", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");
    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search registrants" }),
      "alex@",
    );

    expect(within(dialog).getByText("Alex Chen")).toBeInTheDocument();
    expect(within(dialog).queryByText("Jamie Rivera")).toBeNull();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Showing 1 of 2",
    );
  });

  test("checks in from inside the sheet without closing it", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");
    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Undo check-in" }),
    );

    expect(undoCheckInActionMock).toHaveBeenCalledWith("reg-2");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
