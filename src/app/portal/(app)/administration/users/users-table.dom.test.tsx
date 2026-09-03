import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PortalUser } from "./users-shared";

const updatePreferredNameMock = mock(
  async (
    _userId: string,
    _preferredName: string,
  ): Promise<{ error: string } | { success: true }> => ({
    success: true,
  }),
);

// Mocked wholesale rather than spread over the real module: actions.ts
// imports the server-only Supabase admin client, which throws when pulled
// into a client-component module graph.
const ok = async () => ({ success: true }) as const;

mock.module("./actions", () => ({
  assignRoleAction: ok,
  deactivateUserAction: ok,
  reactivateUserAction: ok,
  revokeRoleAction: ok,
  updateUserPreferredNameAction: updatePreferredNameMock,
}));

const { UsersTable } = await import("./users-table");

function portalUser(overrides: Partial<PortalUser> = {}): PortalUser {
  return {
    user_id: "auth-1",
    email: "avery@example.test",
    full_name: "Avery Morgan",
    person_id: "person-1",
    preferred_name: null,
    person_name: "Avery Morgan",
    roles: ["admin"],
    created_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    ...overrides,
  };
}

describe("UsersTable preferred name", () => {
  beforeEach(() => {
    updatePreferredNameMock.mockClear();
    updatePreferredNameMock.mockImplementation(async () => ({ success: true }));
  });

  test("the Name column prefers the preferred name over the account name", () => {
    render(
      <UsersTable
        users={[portalUser({ preferred_name: "Ave" })]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );
    // Twice over: once resolved in the Name column, once raw in the
    // Preferred name column.
    expect(screen.getAllByText("Ave")).toHaveLength(2);
    expect(screen.queryByText("Avery Morgan")).not.toBeInTheDocument();
  });

  test("falls back to the account name, then the email", () => {
    render(
      <UsersTable
        users={[
          portalUser(),
          portalUser({
            user_id: "auth-2",
            email: "nobody@example.test",
            full_name: null,
            person_id: null,
            person_name: null,
            roles: [],
          }),
        ]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );
    expect(screen.getAllByText("Avery Morgan").length).toBeGreaterThan(0);
    expect(screen.getByText("nobody@example.test")).toBeInTheDocument();
  });

  test("editing a preferred name saves it for that user", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.type(
      screen.getByLabelText("Preferred name for Avery Morgan"),
      "Ave",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save preferred name for Avery Morgan",
      }),
    );

    await waitFor(() =>
      expect(updatePreferredNameMock).toHaveBeenCalledTimes(1),
    );
    expect(updatePreferredNameMock.mock.calls[0]).toEqual(["auth-1", "Ave"]);
  });

  test("Cancel discards the draft without calling the action", async () => {
    const user = userEvent.setup();
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.type(
      screen.getByLabelText("Preferred name for Avery Morgan"),
      "Discarded",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updatePreferredNameMock).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Preferred name for Avery Morgan"),
    ).not.toBeInTheDocument();
  });

  test("a server error is surfaced", async () => {
    const user = userEvent.setup();
    updatePreferredNameMock.mockImplementation(async () => ({
      error: "Could not save the preferred name. Please try again.",
    }));
    render(
      <UsersTable
        users={[portalUser()]}
        currentUserId={null}
        availableRoles={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Edit preferred name for Avery Morgan",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save preferred name for Avery Morgan",
      }),
    );

    expect(
      await screen.findByText(
        "Could not save the preferred name. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});
