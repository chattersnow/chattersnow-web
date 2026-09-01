import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as RegistrantsActions from "./registrants-actions";
import * as PeopleActions from "../people/actions";

type ActionResult = { error: string } | { success: true };

const addRegistrantActionMock = mock<
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
  addRegistrantAction: addRegistrantActionMock,
}));

const listPeopleActionMock = mock(async () => ({
  data: [
    {
      id: "person-1",
      name: "Sam Maybe",
      email: "sam@example.test",
      phone: null,
      is_sponsor: false,
    },
  ],
}));

mock.module("../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { AddRegistrantDialog } = await import("./add-registrant-dialog");

describe("AddRegistrantDialog", () => {
  beforeEach(() => {
    addRegistrantActionMock.mockClear();
  });

  test("registers the selected person without checking them in", async () => {
    const user = userEvent.setup();
    render(<AddRegistrantDialog eventId="event-1" />);

    await user.click(screen.getByRole("button", { name: "+ Add registrant" }));
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    const match = await screen.findByText("Sam Maybe");
    await user.click(match);

    await user.click(screen.getByRole("button", { name: "Add registrant" }));

    expect(addRegistrantActionMock).toHaveBeenCalledWith(
      "event-1",
      {
        id: "person-1",
        name: "Sam Maybe",
        email: "sam@example.test",
        phone: null,
        is_sponsor: false,
      },
      1,
    );
  });

  test("rejects adding a registrant with no person selected", async () => {
    const user = userEvent.setup();
    render(<AddRegistrantDialog eventId="event-1" />);

    await user.click(screen.getByRole("button", { name: "+ Add registrant" }));
    await user.click(screen.getByRole("button", { name: "Add registrant" }));

    expect(
      screen.getByText("Select or create a person to register."),
    ).toBeInTheDocument();
    expect(addRegistrantActionMock).not.toHaveBeenCalled();
  });
});
