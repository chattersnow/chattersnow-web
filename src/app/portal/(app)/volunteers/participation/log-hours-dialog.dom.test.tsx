import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VolunteerHoursActionResult } from "./actions";
import type { PickedPerson } from "../../people/person-picker";
import * as ParticipationActions from "./actions";
import * as RolesActions from "../roles/actions";
import * as PeopleActions from "../../people/actions";

const createVolunteerHoursActionMock = mock<
  (personId: string, formData: FormData) => Promise<VolunteerHoursActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...ParticipationActions,
  createVolunteerHoursAction: createVolunteerHoursActionMock,
  listEventOptionsAction: async () => ({ data: [] }),
}));

mock.module("../roles/actions", () => ({
  ...RolesActions,
  listRoleTypesAction: async () => ({ data: [] }),
}));

const listPeopleActionMock = mock(async () => ({ data: [] }));

mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { LogHoursDialog } = await import("./log-hours-dialog");

const selfPerson: PickedPerson = {
  id: "self-1",
  name: "Casey Rivera",
  email: "volunteer@example.test",
  phone: null,
};

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Log hours" }));
}

describe("LogHoursDialog", () => {
  beforeEach(() => {
    createVolunteerHoursActionMock.mockClear();
    createVolunteerHoursActionMock.mockImplementation(async () => ({
      success: true,
    }));
    listPeopleActionMock.mockClear();
  });

  test("a manager sees the interactive picker regardless of selfPerson", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={true} selfPerson={selfPerson} />);
    await openDialog(user);

    expect(
      screen.getByPlaceholderText("Search by name or email..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Casey Rivera")).not.toBeInTheDocument();
    await waitFor(() => expect(listPeopleActionMock).toHaveBeenCalled());
  });

  test("a self-log-only user with a resolved identity sees a locked, pre-filled field", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={selfPerson} />);
    await openDialog(user);

    expect(screen.getByText("Casey Rivera")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search by name or email..."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change" }),
    ).not.toBeInTheDocument();
    expect(listPeopleActionMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    await waitFor(() =>
      expect(createVolunteerHoursActionMock).toHaveBeenCalledTimes(1),
    );
    expect(createVolunteerHoursActionMock.mock.calls[0][0]).toBe("self-1");
  });

  test("a self-log-only user with no resolved identity falls back to the picker", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={null} />);
    await openDialog(user);

    expect(
      screen.getByPlaceholderText("Search by name or email..."),
    ).toBeInTheDocument();
    await waitFor(() => expect(listPeopleActionMock).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    expect(
      screen.getByText("Select or create a person to log hours for."),
    ).toBeInTheDocument();
    expect(createVolunteerHoursActionMock).not.toHaveBeenCalled();
  });

  test("re-opening after closing keeps the locked default", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={selfPerson} />);
    await openDialog(user);
    await user.keyboard("{Escape}");
    await openDialog(user);

    expect(screen.getByText("Casey Rivera")).toBeInTheDocument();
  });
});
