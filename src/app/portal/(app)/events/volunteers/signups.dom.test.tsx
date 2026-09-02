import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventShift } from "../shifts-actions";
import type { EventVolunteer } from "../volunteers-actions";
import type { PersonListItem } from "../../people/actions";
import { AddVolunteerForm, SignupsSection } from "./signups";

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

const shiftWithoutRole: EventShift = {
  ...shiftWithRole,
  id: "shift-2",
  label: "Basecamp PM",
  volunteer_role_type_id: null,
  role_type: null,
};

const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    is_sponsor: false,
  },
];

function makeVolunteer(
  overrides: Partial<EventVolunteer> = {},
): EventVolunteer {
  return {
    id: "volunteer-1",
    event_id: "event-1",
    person_id: "person-1",
    shift_id: null,
    role: null,
    notes: null,
    person: { id: "person-1", name: "Jane Doe", email: null, phone: null },
    ...overrides,
  };
}

describe("AddVolunteerForm", () => {
  test("shows the shift's role read-only and submits an empty role", async () => {
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
    expect(formData.get("role")).toBe("");
    expect(formData.get("shiftId")).toBe("shift-1");
  });

  test("accepts and submits a free-text role when no shift is selected", async () => {
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
        onPersonCreated={noop}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await selectJaneDoe(user);
    await user.type(
      screen.getByPlaceholderText(/Ride Buddy, Event Setup/),
      "Setup Crew",
    );
    await user.click(screen.getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("role")).toBe("Setup Crew");
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

    expect(
      screen.getByPlaceholderText(/Ride Buddy, Event Setup/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("shiftId")).toBe("");
  });
});

describe("SignupsSection role label", () => {
  const shifts = [shiftWithRole, shiftWithoutRole];

  test("shows the assigned shift's role", () => {
    render(
      <SignupsSection
        volunteers={[makeVolunteer({ shift_id: "shift-1", role: "Ignored" })]}
        shifts={shifts}
        mode="view"
        isDeleting={false}
        loading={false}
        onDeleteVolunteer={noop}
        onShiftReassign={noop}
      />,
    );
    expect(screen.getByText("Ride Buddy")).toBeInTheDocument();
  });

  test("shows 'No role' for a shift with no role type", () => {
    render(
      <SignupsSection
        volunteers={[makeVolunteer({ shift_id: "shift-2" })]}
        shifts={shifts}
        mode="view"
        isDeleting={false}
        loading={false}
        onDeleteVolunteer={noop}
        onShiftReassign={noop}
      />,
    );
    expect(screen.getByText("No role")).toBeInTheDocument();
  });

  test("shows the free-text role for a shift-less signup", () => {
    render(
      <SignupsSection
        volunteers={[makeVolunteer({ shift_id: null, role: "Setup Crew" })]}
        shifts={shifts}
        mode="view"
        isDeleting={false}
        loading={false}
        onDeleteVolunteer={noop}
        onShiftReassign={noop}
      />,
    );
    expect(screen.getByText("Setup Crew")).toBeInTheDocument();
  });

  test("shows a dash for a shift-less signup with no role", () => {
    render(
      <SignupsSection
        volunteers={[makeVolunteer({ shift_id: null, role: null })]}
        shifts={shifts}
        mode="view"
        isDeleting={false}
        loading={false}
        onDeleteVolunteer={noop}
        onShiftReassign={noop}
      />,
    );
    const row = screen.getByText("Jane Doe").closest("tr");
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll("td");
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
  });

  test("reassigning to 'No shift' calls onShiftReassign with null", async () => {
    const onShiftReassign = mock(() => {});
    const user = userEvent.setup();
    render(
      <SignupsSection
        volunteers={[makeVolunteer({ shift_id: "shift-1" })]}
        shifts={shifts}
        mode="edit"
        isDeleting={false}
        loading={false}
        onDeleteVolunteer={noop}
        onShiftReassign={onShiftReassign}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Shift for Jane Doe" }),
    );
    await user.click(await screen.findByRole("option", { name: "No shift" }));

    expect(onShiftReassign).toHaveBeenCalledWith("volunteer-1", null);
  });
});
