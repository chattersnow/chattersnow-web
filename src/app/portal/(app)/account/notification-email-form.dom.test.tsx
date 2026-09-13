import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { renderWithToaster } from "../../../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import * as AccountActions from "./actions";

const saveMock = mock(
  async (_email: string): Promise<{ error: string } | { success: true }> => ({
    success: true,
  }),
);

mock.module("./actions", () => ({
  ...AccountActions,
  updateMyNotificationEmailAction: saveMock,
}));

const { NotificationEmailForm } = await import("./notification-email-form");

const SIGN_IN = "avery@gmail.test";

describe("NotificationEmailForm", () => {
  beforeEach(() => {
    saveMock.mockClear();
    saveMock.mockImplementation(async () => ({ success: true }));
  });

  test("shows the sign-in address as the fallback when nothing is set", () => {
    renderWithToaster(
      <NotificationEmailForm notificationEmail={null} signInEmail={SIGN_IN} />,
    );

    expect(screen.getByLabelText("Send them to")).toHaveAttribute(
      "placeholder",
      SIGN_IN,
    );
  });

  test("Save is disabled until the address changes", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <NotificationEmailForm
        notificationEmail="ops@chattersnow.test"
        signInEmail={SIGN_IN}
      />,
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Send them to"), "x");
    expect(save).not.toBeDisabled();
  });

  test("saves the override", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <NotificationEmailForm notificationEmail={null} signInEmail={SIGN_IN} />,
    );

    await user.type(
      screen.getByLabelText("Send them to"),
      "ops@chattersnow.test",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith("ops@chattersnow.test"),
    );
  });

  // Clearing is the only way back to the sign-in address, so an empty submit
  // has to reach the action rather than being read as "nothing to save".
  test("an emptied field clears the override", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <NotificationEmailForm
        notificationEmail="ops@chattersnow.test"
        signInEmail={SIGN_IN}
      />,
    );

    await user.clear(screen.getByLabelText("Send them to"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledWith(""));
  });
});
