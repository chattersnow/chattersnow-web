import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult } from "./actions";
import type { PersonRow } from "./people-shared";
import * as PeopleActions from "./actions";

const updatePersonActionMock = mock<
  (id: string, formData: FormData) => Promise<PersonActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...PeopleActions,
  updatePersonAction: updatePersonActionMock,
}));

const { EditPersonModal } = await import("./edit-person-modal");

const person: PersonRow = {
  id: "1",
  name: "Jane Donor",
  email: "jane@example.com",
  phone: "555-1234",
  notes: "VIP",
  logo_url: null,
  website: null,
  is_donor: true,
  is_sponsor: false,
  is_volunteer: false,
};

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "View person" }));
}

async function enterEditMode(user: ReturnType<typeof userEvent.setup>) {
  await openSheet(user);
  await user.click(screen.getByRole("button", { name: "Edit person" }));
}

describe("EditPersonModal", () => {
  beforeEach(() => {
    updatePersonActionMock.mockClear();
    updatePersonActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("shows the person's details and roles in view mode", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await openSheet(user);

    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Donor")).toBeInTheDocument();
  });

  test("entering edit mode pre-fills the form from the person", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);

    expect(screen.getByLabelText("Name")).toHaveValue("Jane Donor");
    expect(screen.getByRole("checkbox", { name: "Donor" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("exiting edit mode without changes skips the discard confirmation", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);
    await user.click(screen.getByRole("button", { name: "View" }));

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
  });

  test("exiting edit mode with unsaved changes asks to discard, and keeps the edit on cancel", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Changed Name");
    await user.click(screen.getByRole("button", { name: "View" }));

    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Changed Name");
  });

  test("discarding changes reverts the form and returns to view mode", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Changed Name");
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
  });

  test("saves the form and returns to view mode on success", async () => {
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Updated Name");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // View mode reads from the `person` prop, which the parent (not this
    // component) updates after a real save — so it still shows the original
    // name here. What this asserts is that the save succeeded and the sheet
    // switched back to view mode.
    await screen.findByRole("button", { name: "Edit person" });
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(updatePersonActionMock).toHaveBeenCalledTimes(1);

    const submitted = updatePersonActionMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Updated Name");
  });

  test("shows the server error and stays in edit mode on failure", async () => {
    updatePersonActionMock.mockImplementation(async () => ({
      error: "Could not update this person. Please try again.",
    }));
    const user = userEvent.setup();
    render(<EditPersonModal person={person} />);

    await enterEditMode(user);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(
        "Could not update this person. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});
