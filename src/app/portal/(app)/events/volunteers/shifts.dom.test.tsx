import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventShift } from "../shifts-actions";
import type { RoleType } from "../../volunteers/roles/actions";
import { ShiftForm, ShiftsSection, NONE_VALUE } from "./shifts";

const roleTypes: RoleType[] = [
  { id: "role-1", name: "Ride Buddy" },
  { id: "role-2", name: "Basecamp Staffing" },
];

const baseShift: EventShift = {
  id: "shift-1",
  event_id: "event-1",
  label: "Basecamp AM",
  starts_at: "2026-09-01T08:00:00.000Z",
  ends_at: "2026-09-01T12:00:00.000Z",
  target_headcount: 4,
  notes: null,
  volunteer_role_type_id: null,
  role_type: null,
};

function noop() {}

describe("ShiftForm", () => {
  test("defaults to no role and omits volunteerRoleTypeId when unset", async () => {
    const onSubmit = mock(
      async (
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    render(
      <ShiftForm roleTypes={roleTypes} onSubmit={onSubmit} onCancel={noop} />,
    );

    expect(NONE_VALUE).toBe("none");
    expect(screen.getByText("No role")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Duty / location"), "Basecamp AM");
    await user.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][0] as FormData;
    expect(formData.get("volunteerRoleTypeId")).toBe("");
  });

  test("submits the selected role type id", async () => {
    const onSubmit = mock(
      async (
        _formData: FormData,
      ): Promise<{ error: string } | { success: true }> => ({
        success: true,
      }),
    );
    const user = userEvent.setup();
    render(
      <ShiftForm roleTypes={roleTypes} onSubmit={onSubmit} onCancel={noop} />,
    );

    await user.type(screen.getByLabelText("Duty / location"), "Basecamp AM");
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "Ride Buddy" }));
    await user.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0][0] as FormData;
    expect(formData.get("volunteerRoleTypeId")).toBe("role-1");
  });
});

describe("ShiftsSection", () => {
  test("shows the shift's live-joined role in the table", async () => {
    render(
      <ShiftsSection
        shifts={[
          {
            ...baseShift,
            volunteer_role_type_id: "role-1",
            role_type: { id: "role-1", name: "Ride Buddy" },
          },
        ]}
        shiftHeadcounts={new Map()}
        mode="view"
        isDeleting={false}
        onUpdateShift={async () => ({ success: true })}
        onDeleteShift={noop}
        fetchRoleTypes={async () => ({ data: roleTypes })}
      />,
    );

    expect(await screen.findByText("Ride Buddy")).toBeInTheDocument();
  });

  test("surfaces an error when the role catalog fails to load", async () => {
    render(
      <ShiftsSection
        shifts={[]}
        shiftHeadcounts={new Map()}
        mode="edit"
        isDeleting={false}
        onUpdateShift={async () => ({ success: true })}
        onDeleteShift={noop}
        fetchRoleTypes={async () => ({
          error: "You do not have permission to view volunteer roles.",
        })}
      />,
    );

    expect(
      await screen.findByText(
        "You do not have permission to view volunteer roles.",
      ),
    ).toBeInTheDocument();
  });
});
