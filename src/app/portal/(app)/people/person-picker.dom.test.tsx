import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult, PersonListItem } from "./actions";
import * as PeopleActions from "./actions";

const createPersonActionMock = mock(async (): Promise<PersonActionResult> => ({
  success: true,
  person: { id: "new-1", name: "New Person", email: null, phone: null },
}));

mock.module("./actions", () => ({
  ...PeopleActions,
  createPersonAction: createPersonActionMock,
}));

const { PersonPicker } = await import("./person-picker");

const people: PersonListItem[] = [
  {
    id: "1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    is_sponsor: false,
    // Holds a portal login -- the only fixture that should get the badge.
    auth_user_id: "auth-1",
  },
  {
    id: "2",
    name: "John Smith",
    preferred_name: "Johnny",
    email: "john@acme.com",
    phone: null,
    is_sponsor: true,
    auth_user_id: null,
  },
];

function noop() {}

describe("PersonPicker", () => {
  beforeEach(() => {
    createPersonActionMock.mockClear();
    createPersonActionMock.mockImplementation(async () => ({
      success: true,
      person: { id: "new-1", name: "New Person", email: null, phone: null },
    }));
  });

  test("shows the selected person and clears the selection on Change", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <PersonPicker
        people={people}
        selected={{
          id: "1",
          name: "Jane Doe",
          email: "jane@example.com",
          phone: null,
        }}
        onSelect={onSelect}
        onPersonCreated={noop}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test("filters people by search and selects a match", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={onSelect}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/search by name or email/i),
      "jane",
    );
    const match = await screen.findByText("Jane Doe");
    await user.click(match);

    expect(onSelect).toHaveBeenCalledWith(people[0]);
  });

  test("shows a no-matches message when the search has no results", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/search by name or email/i),
      "nomatch",
    );

    expect(
      await screen.findByText('No matches for "nomatch".'),
    ).toBeInTheDocument();
  });

  test("pre-checks no role when no newPersonRole is given", async () => {
    // Regression for #569: this used to fall back to is_sponsor, so every
    // picker in the app pre-checked Sponsor regardless of context.
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={mock(() => {})}
        onPersonCreated={mock(() => {})}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    for (const role of ["Donor", "Sponsor", "Volunteer", "Attendee"]) {
      expect(screen.getByRole("checkbox", { name: role })).not.toBeChecked();
    }
  });

  test("pre-checks the role it is given", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={mock(() => {})}
        onPersonCreated={mock(() => {})}
        newPersonRole="is_attendee"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    expect(screen.getByRole("checkbox", { name: "Attendee" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("creates and selects a new person", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    const onPersonCreated = mock(() => {});
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={onSelect}
        onPersonCreated={onPersonCreated}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );
    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(createPersonActionMock).toHaveBeenCalledTimes(1);
    const created = {
      id: "new-1",
      name: "New Person",
      email: null,
      phone: null,
    };
    expect(onPersonCreated).toHaveBeenCalledWith(created);
    expect(onSelect).toHaveBeenCalledWith(created);
  });

  test("shows the server error when creation fails", async () => {
    createPersonActionMock.mockImplementation(async () => ({
      error: "Could not save this person. Please try again.",
    }));
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );
    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    expect(
      await screen.findByText("Could not save this person. Please try again."),
    ).toBeInTheDocument();
  });
});

describe("PersonPicker portal accounts and preferred names", () => {
  test("badges only the people who hold a portal login", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "example.com",
    );
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Portal user")).toBeInTheDocument();
  });

  test("a directory-only person gets no badge", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "acme",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
    expect(screen.queryByText("Portal user")).not.toBeInTheDocument();
  });

  test("results show the preferred name in place of the legal name", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "John Smith",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
  });

  test("matches a search on the preferred name", async () => {
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={people}
        selected={null}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "johnny",
    );
    expect(await screen.findByText("Johnny")).toBeInTheDocument();
  });

  test("the selected chip badges a portal user and uses the preferred name", () => {
    render(
      <PersonPicker
        people={people}
        selected={{
          id: "2",
          name: "John Smith",
          preferred_name: "Johnny",
          email: "john@acme.com",
          phone: null,
          auth_user_id: "auth-2",
        }}
        onSelect={noop}
        onPersonCreated={noop}
      />,
    );

    expect(screen.getByText("Johnny")).toBeInTheDocument();
    expect(screen.getByText("Portal user")).toBeInTheDocument();
  });
});
