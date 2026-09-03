import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult } from "../actions";
import type { PersonRow } from "../people-shared";
import * as PeopleActions from "../actions";

const updatePersonActionMock = mock<
  (
    id: string,
    formData: FormData,
    primaryContactPersonId?: string | null,
  ) => Promise<PersonActionResult>
>(async () => ({ success: true }));

mock.module("../actions", () => ({
  ...PeopleActions,
  updatePersonAction: updatePersonActionMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const { ProfileCard } = await import("./profile-card");

const person: PersonRow = {
  id: "1",
  name: "Jane Donor",
  preferred_name: null,
  email: "jane@example.com",
  phone: "555-1234",
  instagram_handle: null,
  notes: "VIP",
  logo_url: null,
  website: null,
  auth_user_id: null,
  is_donor: true,
  is_sponsor: false,
  is_volunteer: false,
  is_attendee: false,
  is_staff: false,
  person_type: "individual",
  primary_contact_person_id: null,
  primary_contact: null,
  riding_discipline: "both",
  ski_experience_level: "beginner",
  snowboard_experience_level: "advanced",
  preferred_mountain: "Hunter",
};

describe("ProfileCard", () => {
  beforeEach(() => {
    updatePersonActionMock.mockClear();
    updatePersonActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("shows the person's details and roles in view mode", () => {
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Donor")).toBeInTheDocument();
  });

  test("hides the edit action when the user cannot manage people", () => {
    render(<ProfileCard person={person} people={[]} canManage={false} />);

    expect(
      screen.queryByRole("button", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  });

  test("entering edit mode pre-fills the form from the person", async () => {
    const user = userEvent.setup();
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Edit profile" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Jane Donor");
    expect(screen.getByRole("checkbox", { name: "Donor" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("saves changes and returns to view mode", async () => {
    const user = userEvent.setup();
    render(<ProfileCard person={person} people={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updatePersonActionMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });
});
