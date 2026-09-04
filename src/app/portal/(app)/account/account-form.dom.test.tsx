import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import * as AccountActions from "./actions";

const updateMock = mock(
  async (
    _preferredName: string,
  ): Promise<{ error: string } | { success: true }> => ({
    success: true,
  }),
);

mock.module("./actions", () => ({
  ...AccountActions,
  updateMyPreferredNameAction: updateMock,
}));

const { AccountForm } = await import("./account-form");

describe("AccountForm", () => {
  beforeEach(() => {
    updateMock.mockClear();
    updateMock.mockImplementation(async () => ({ success: true }));
  });

  test("Save is disabled until the preferred name changes", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <AccountForm preferredName="Ave" fallbackName="Avery Morgan" />,
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Preferred name"), "ry");
    expect(save).not.toBeDisabled();
  });

  test("falls back to the account name as the placeholder", () => {
    renderWithToaster(
      <AccountForm preferredName={null} fallbackName="Avery Morgan" />,
    );
    expect(screen.getByLabelText("Preferred name")).toHaveAttribute(
      "placeholder",
      "Avery Morgan",
    );
  });

  test("submits the new preferred name and confirms", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <AccountForm preferredName={null} fallbackName="Avery Morgan" />,
    );

    await user.type(screen.getByLabelText("Preferred name"), "Ave");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][0]).toBe("Ave");
    await expectToast("Preferred name saved.");
  });

  test("clearing the field is a valid change (it removes the override)", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <AccountForm preferredName="Ave" fallbackName="Avery Morgan" />,
    );

    await user.clear(screen.getByLabelText("Preferred name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][0]).toBe("");
  });

  test("surfaces a server error and does not claim success", async () => {
    const user = userEvent.setup();
    updateMock.mockImplementation(async () => ({ error: "Nope." }));
    renderWithToaster(
      <AccountForm preferredName={null} fallbackName="Avery Morgan" />,
    );

    await user.type(screen.getByLabelText("Preferred name"), "Ave");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(hasToast("Preferred name saved.")).toBe(false);
  });
});
