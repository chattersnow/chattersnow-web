import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult, PersonListItem } from "./actions";
import * as PeopleActions from "./actions";

const createPersonActionMock = mock(
  async (): Promise<PersonActionResult> => ({
    success: true,
    person: { id: "new-1", name: "New Person", email: null, phone: null },
  })
);

mock.module("./actions", () => ({
  ...PeopleActions,
  createPersonAction: createPersonActionMock,
}));

const { PersonPicker } = await import("./person-picker");

const people: PersonListItem[] = [
  { id: "1", name: "Jane Doe", email: "jane@example.com", phone: null, is_sponsor: false },
  { id: "2", name: "John Smith", email: "john@acme.com", phone: null, is_sponsor: true },
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
        selected={{ id: "1", name: "Jane Doe", email: "jane@example.com", phone: null }}
        onSelect={onSelect}
        onPersonCreated={noop}
      />
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test("filters people by search and selects a match", async () => {
    const user = userEvent.setup();
    const onSelect = mock(() => {});
    render(
      <PersonPicker people={people} selected={null} onSelect={onSelect} onPersonCreated={noop} />
    );

    await user.type(screen.getByPlaceholderText(/search by name or email/i), "jane");
    const match = await screen.findByText("Jane Doe");
    await user.click(match);

    expect(onSelect).toHaveBeenCalledWith(people[0]);
  });

  test("shows a no-matches message when the search has no results", async () => {
    const user = userEvent.setup();
    render(<PersonPicker people={people} selected={null} onSelect={noop} onPersonCreated={noop} />);

    await user.type(screen.getByPlaceholderText(/search by name or email/i), "nomatch");

    expect(await screen.findByText('No matches for "nomatch".')).toBeInTheDocument();
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
      />
    );

    await user.click(screen.getByRole("button", { name: "+ Create new person" }));
    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(createPersonActionMock).toHaveBeenCalledTimes(1);
    const created = { id: "new-1", name: "New Person", email: null, phone: null };
    expect(onPersonCreated).toHaveBeenCalledWith(created);
    expect(onSelect).toHaveBeenCalledWith(created);
  });

  test("shows the server error when creation fails", async () => {
    createPersonActionMock.mockImplementation(async () => ({
      error: "Could not save this person. Please try again.",
    }));
    const user = userEvent.setup();
    render(<PersonPicker people={people} selected={null} onSelect={noop} onPersonCreated={noop} />);

    await user.click(screen.getByRole("button", { name: "+ Create new person" }));
    await user.type(screen.getByLabelText("Name"), "New Person");
    await user.click(screen.getByRole("button", { name: "Create & select" }));

    expect(
      await screen.findByText("Could not save this person. Please try again.")
    ).toBeInTheDocument();
  });
});
