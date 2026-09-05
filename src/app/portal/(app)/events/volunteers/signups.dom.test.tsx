import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventShift } from "../shifts-actions";
import type { PersonListItem } from "../../people/actions";
import { AddVolunteerForm } from "./signups";
import type { RoleType } from "../../volunteers/roles/actions";

const roleTypes: RoleType[] = [
  { id: "role-1", name: "Ride Buddy" },
  { id: "role-2", name: "Setup Crew" },
];

function noop() {}

async function selectJaneDoe(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText(/search by name or email/i),
    "jane",
  );
  await user.click(await screen.findByText("Jane Doe"));
}

const shiftWithRole: EventShift = {
  id: "shift-1",
  event_id: "event-1",
  label: "Basecamp AM",
  starts_at: "2026-09-01T08:00:00.000Z",
  ends_at: "2026-09-01T12:00:00.000Z",
  target_headcount: 4,
  notes: null,
  volunteer_role_type_id: "role-1",
  role_type: { id: "role-1", name: "Ride Buddy" },
};

const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
  },
];

describe("AddVolunteerForm", () => {
  test("shows the shift's role read-only and submits no role type", async () => {
    const onSubmit = mock(
      async (
        _personId: string,
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    const user = userEvent.setup();
    render(
      <AddVolunteerForm
        people={people}
        shifts={[shiftWithRole]}
        roleTypes={roleTypes}
        onPersonCreated={noop}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await selectJaneDoe(user);
    await user.click(screen.getByRole("combobox", { name: "Shift" }));
    await user.click(
      await screen.findByRole("option", { name: /Basecamp AM/ }),
    );

    expect(screen.getByText("Ride Buddy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [personId, formData] = onSubmit.mock.calls[0] as [string, FormData];
    expect(personId).toBe("person-1");
    expect(formData.get("volunteerRoleTypeId")).toBe("");
    expect(formData.get("shiftId")).toBe("shift-1");
  });

  test("submits the role type picked when no shift is selected", async () => {
    const onSubmit = mock(
      async (
        _personId: string,
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    const user = userEvent.setup();
    render(
      <AddVolunteerForm
        people={people}
        shifts={[shiftWithRole]}
        roleTypes={roleTypes}
        onPersonCreated={noop}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await selectJaneDoe(user);
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "Setup Crew" }));
    await user.click(screen.getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("volunteerRoleTypeId")).toBe("role-2");
    expect(formData.get("shiftId")).toBe("");
  });

  test("resets to no-shift via the 'No shift' option", async () => {
    const onSubmit = mock(
      async (
        _personId: string,
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    const user = userEvent.setup();
    render(
      <AddVolunteerForm
        people={people}
        shifts={[shiftWithRole]}
        roleTypes={roleTypes}
        onPersonCreated={noop}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await selectJaneDoe(user);
    await user.click(screen.getByRole("combobox", { name: "Shift" }));
    await user.click(
      await screen.findByRole("option", { name: /Basecamp AM/ }),
    );
    await user.click(screen.getByRole("combobox", { name: "Shift" }));
    await user.click(
      await screen.findByRole("option", { name: "No shift (whole event)" }),
    );

    expect(screen.getByRole("combobox", { name: "Role" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("shiftId")).toBe("");
  });
});
