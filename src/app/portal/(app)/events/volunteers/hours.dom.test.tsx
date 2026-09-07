import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventShift } from "../shifts-actions";
import type { EventVolunteer } from "../volunteers-actions";
import { AddHoursForm } from "./hours";
import type { RoleType } from "../../volunteers/roles/actions";

const roleTypes: RoleType[] = [
  { id: "role-1", name: "Ride Buddy" },
  { id: "role-2", name: "Setup Crew" },
];

function noop() {}

const shift: EventShift = {
  id: "shift-1",
  event_id: "event-1",
  label: "Basecamp AM",
  starts_at: "2026-09-01T08:00:00.000Z",
  ends_at: "2026-09-01T12:30:00.000Z",
  target_headcount: 4,
  notes: null,
  volunteer_role_type_id: "role-1",
  role_type: { id: "role-1", name: "Ride Buddy" },
};

const volunteerWithShift: EventVolunteer = {
  id: "volunteer-1",
  event_id: "event-1",
  person_id: "person-1",
  shift_id: "shift-1",
  role: null,
  volunteer_role_type_id: null,
  role_type: null,
  notes: null,
  person: { id: "person-1", name: "Jane Doe", email: null, phone: null },
};

const volunteerWithoutShift: EventVolunteer = {
  id: "volunteer-2",
  event_id: "event-1",
  person_id: "person-2",
  shift_id: null,
  role: null,
  volunteer_role_type_id: "role-2",
  role_type: { name: "Setup Crew" },
  notes: null,
  person: { id: "person-2", name: "John Smith", email: null, phone: null },
};

async function pickVolunteer(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(
    screen.getByPlaceholderText("Search signed-up volunteers..."),
    name,
  );
  await user.click(await screen.findByText(name));
}

describe("AddHoursForm", () => {
  test("scopes the picker to signed-up volunteers and hides create-person", async () => {
    const user = userEvent.setup();
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift, volunteerWithoutShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "+ Create new person" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Search signed-up volunteers..."),
      "Nobody",
    );
    expect(
      await screen.findByText('No matches for "Nobody".'),
    ).toBeInTheDocument();

    await user.clear(
      screen.getByPlaceholderText("Search signed-up volunteers..."),
    );
    await user.type(
      screen.getByPlaceholderText("Search signed-up volunteers..."),
      "John",
    );
    expect(await screen.findByText("John Smith")).toBeInTheDocument();
  });

  test("auto-fills hours and date from the volunteer's assigned shift", async () => {
    const user = userEvent.setup();
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    await pickVolunteer(user, "Jane Doe");

    expect(screen.getByLabelText("Hours")).toHaveValue(4.5);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-01");
  });

  test("auto-filled hours/date remain editable", async () => {
    const user = userEvent.setup();
    const onSubmit = mock(
      async (
        _personId: string,
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await pickVolunteer(user, "Jane Doe");
    await user.clear(screen.getByLabelText("Hours"));
    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("hours")).toBe("2");
  });

  test("does not touch hours/date for a volunteer with no shift", async () => {
    const user = userEvent.setup();
    render(
      <AddHoursForm
        volunteers={[volunteerWithoutShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    await pickVolunteer(user, "John Smith");

    expect(screen.getByLabelText("Hours")).toHaveValue(null);
  });
});

describe("AddHoursForm with a locked volunteer", () => {
  test("names the volunteer read-only instead of offering a picker", () => {
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithShift.person}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search signed-up volunteers..."),
    ).not.toBeInTheDocument();
  });

  test("seeds hours and date from the locked volunteer's shift", () => {
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithShift.person}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    expect(screen.getByLabelText("Hours")).toHaveValue(4.5);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-01");
  });

  test("submits for the locked volunteer without a selection step", async () => {
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
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithShift.person}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Log hours" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toBe("person-1");
  });

  test("seeds the role from the locked volunteer's shift", () => {
    render(
      <AddHoursForm
        volunteers={[volunteerWithShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithShift.person}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Role" })).toHaveTextContent(
      "Ride Buddy",
    );
  });

  test("falls back to the signup's own role when it has no shift", async () => {
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
      <AddHoursForm
        volunteers={[volunteerWithoutShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithoutShift.person}
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Role" })).toHaveTextContent(
      "Setup Crew",
    );

    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const formData = onSubmit.mock.calls[0][1] as FormData;
    expect(formData.get("volunteerRoleTypeId")).toBe("role-2");
  });

  test("leaves hours blank when the locked volunteer has no shift", () => {
    render(
      <AddHoursForm
        volunteers={[volunteerWithoutShift]}
        shifts={[shift]}
        roleTypes={roleTypes}
        lockedPerson={volunteerWithoutShift.person}
        onSubmit={async () => ({ success: true })}
        onCancel={noop}
      />,
    );

    expect(screen.getByLabelText("Hours")).toHaveValue(null);
  });
});
