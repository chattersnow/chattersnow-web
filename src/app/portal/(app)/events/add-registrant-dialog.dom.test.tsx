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
    optionCounts?: Record<string, number> | null,
  ) => Promise<ActionResult>
>(async () => ({ success: true }));

// #1407. No question by default; the case that is about one sets it.
const listOptionsMock = mock<
  () => Promise<{
    data: {
      prompt: string;
      options: {
        id: string;
        label: string;
        cap: number | null;
        taken: number;
      }[];
    } | null;
  }>
>(async () => ({ data: null }));

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  addRegistrantAction: addRegistrantActionMock,
  listEventRegistrationOptionsAction: listOptionsMock,
}));

const listPeopleActionMock = mock(async () => ({
  data: [
    {
      id: "person-1",
      name: "Sam Maybe",
      email: "sam@example.test",
      phone: null,
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
    listOptionsMock.mockImplementation(async () => ({ data: null }));
  });

  test("records what the party needs when the event asks (#1407)", async () => {
    listOptionsMock.mockImplementation(async () => ({
      data: {
        prompt: "What do you need?",
        options: [
          { id: "own", label: "Own gear", cap: null, taken: 0 },
          { id: "ticket", label: "Need a ticket", cap: 1, taken: 1 },
        ],
      },
    }));
    const user = userEvent.setup();
    render(<AddRegistrantDialog eventId="event-1" />);

    await user.click(screen.getByRole("button", { name: "+ Add registrant" }));
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    await user.click(await screen.findByText("Sam Maybe"));
    // Staff are not held to a cap, so a full option stays editable.
    await user.type(await screen.findByLabelText("Need a ticket (cap 1)"), "1");

    await user.click(screen.getByRole("button", { name: "Add registrant" }));

    expect(addRegistrantActionMock).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ id: "person-1" }),
      1,
      { ticket: 1 },
    );
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
      },
      1,
      null,
    );
  });

  test("pre-checks Attendee when creating a new person", async () => {
    // Issue #569: this defaulted to Sponsor, so walk-up registrants were
    // miscategorised whenever staff didn't notice and change it.
    const user = userEvent.setup();
    render(<AddRegistrantDialog eventId="event-1" />);

    await user.click(screen.getByRole("button", { name: "+ Add registrant" }));
    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    expect(screen.getByRole("checkbox", { name: "Attendee" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
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
