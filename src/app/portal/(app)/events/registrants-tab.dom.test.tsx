import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventRegistrant } from "./registrants-actions";
import * as RegistrantsActions from "./registrants-actions";

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
    person_id: null,
    checked_in_at: null,
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
    person_id: null,
    checked_in_at: "2026-08-28T09:00:00Z",
  },
];

const listEventRegistrantsActionMock = mock(async () => ({
  data: registrants,
}));
const checkInRegistrantActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);
const undoCheckInActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
  checkInRegistrantAction: checkInRegistrantActionMock,
  undoCheckInAction: undoCheckInActionMock,
}));

const { RegistrantsTab } = await import("./registrants-tab");

describe("RegistrantsTab", () => {
  beforeEach(() => {
    listEventRegistrantsActionMock.mockClear();
    checkInRegistrantActionMock.mockClear();
    undoCheckInActionMock.mockClear();
    listEventRegistrantsActionMock.mockImplementation(async () => ({
      data: registrants,
    }));
  });

  test("loads and displays registrants with summary counts", async () => {
    render(
      <RegistrantsTab eventId="event-1" capacity={10} active mode="view" />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 registrations, 3 attending of 10 capacity · 1 checked in",
      ),
    ).toBeInTheDocument();
  });

  test("view mode hides check-in controls", async () => {
    render(
      <RegistrantsTab eventId="event-1" capacity={null} active mode="view" />,
    );
    await screen.findByText("Jamie Rivera");

    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  test("checks in a registrant and shows undo for an already checked-in one", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab eventId="event-1" capacity={null} active mode="edit" />,
    );
    await screen.findByText("Jamie Rivera");

    expect(
      screen.getByRole("button", { name: "Undo check-in" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(checkInRegistrantActionMock).toHaveBeenCalledWith("reg-1");
    expect(listEventRegistrantsActionMock.mock.calls.length).toBeGreaterThan(1);
  });

  test("undoing a check-in calls undoCheckInAction", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab eventId="event-1" capacity={null} active mode="edit" />,
    );
    await screen.findByText("Alex Chen");

    await user.click(screen.getByRole("button", { name: "Undo check-in" }));

    expect(undoCheckInActionMock).toHaveBeenCalledWith("reg-2");
  });
});
