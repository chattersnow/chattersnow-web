import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as RegistrantsActions from "./registrants-actions";
import * as PeopleActions from "../people/actions";

type ActionResult = { error: string } | { success: true };

const createWalkInCheckInActionMock = mock<
  (
    eventId: string,
    person: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
    },
    partySize: number,
  ) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  createWalkInCheckInAction: createWalkInCheckInActionMock,
}));

const listPeopleActionMock = mock(async () => ({
  data: [
    {
      id: "person-1",
      name: "Sam Walk-in",
      email: "sam@example.test",
      phone: null,
    },
  ],
}));

mock.module("../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { CheckInWalkInDialog } = await import("./check-in-walkin-dialog");

describe("CheckInWalkInDialog", () => {
  beforeEach(() => {
    createWalkInCheckInActionMock.mockClear();
  });

  test("checks in a walk-in with the selected person and party size", async () => {
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    const match = await screen.findByText("Sam Walk-in");
    await user.click(match);

    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    expect(createWalkInCheckInActionMock).toHaveBeenCalledWith(
      "event-1",
      {
        id: "person-1",
        name: "Sam Walk-in",
        email: "sam@example.test",
        phone: null,
      },
      1,
    );
  });

  test("pre-checks Attendee when creating a new person", async () => {
    // Issue #569: a bare walk-in defaulted to the Sponsor role.
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    expect(screen.getByRole("checkbox", { name: "Attendee" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("rejects a walk-in with no person selected", async () => {
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    expect(
      screen.getByText("Select or create a person to check in."),
    ).toBeInTheDocument();
    expect(createWalkInCheckInActionMock).not.toHaveBeenCalled();
  });
});
