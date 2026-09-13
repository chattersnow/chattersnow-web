import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { renderWithToaster } from "../../../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import * as AccountActions from "./actions";
import type { NotificationEmailResult } from "@/lib/notifications/notification-email-confirmation";

const saveMock = mock(
  async (_email: string): Promise<NotificationEmailResult> => ({
    success: true,
    outcome: "pending",
    pendingEmail: "ops@chattersnow.test",
  }),
);

const resendMock = mock(
  async (_email: string): Promise<NotificationEmailResult> => ({
    success: true,
    outcome: "pending",
    pendingEmail: "ops@chattersnow.test",
  }),
);

mock.module("./actions", () => ({
  ...AccountActions,
  updateMyNotificationEmailAction: saveMock,
  resendMyNotificationEmailConfirmationAction: resendMock,
}));

const { NotificationEmailForm } = await import("./notification-email-form");

const SIGN_IN = "avery@gmail.test";

const props = {
  notificationEmail: null,
  pendingEmail: null,
  pendingExpiresAt: null,
  signInEmail: SIGN_IN,
  orgEmailEnabled: true,
};

describe("NotificationEmailForm", () => {
  beforeEach(() => {
    saveMock.mockClear();
    saveMock.mockImplementation(async () => ({
      success: true,
      outcome: "pending",
      pendingEmail: "ops@chattersnow.test",
    }));
    resendMock.mockClear();
  });

  test("shows the sign-in address as the fallback when nothing is set", () => {
    renderWithToaster(<NotificationEmailForm {...props} />);

    expect(screen.getByLabelText("Send them to")).toHaveAttribute(
      "placeholder",
      SIGN_IN,
    );
  });

  test("Save is disabled until the address changes", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <NotificationEmailForm
        {...props}
        notificationEmail="ops@chattersnow.test"
      />,
    );

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Send them to"), "x");
    expect(save).not.toBeDisabled();
  });

  test("saves the requested address", async () => {
    const user = userEvent.setup();
    renderWithToaster(<NotificationEmailForm {...props} />);

    await user.type(
      screen.getByLabelText("Send them to"),
      "ops@chattersnow.test",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith("ops@chattersnow.test"),
    );
  });

  // The state this feature exists for: asked for, and not yet receiving
  // anything. Reporting it as a plain save would leave somebody watching an
  // inbox that is not going to get the mail.
  test("says the address is waiting once a request is made", async () => {
    const user = userEvent.setup();
    renderWithToaster(<NotificationEmailForm {...props} />);

    await user.type(
      screen.getByLabelText("Send them to"),
      "ops@chattersnow.test",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.getByText(/is waiting to be confirmed/i),
      ).toBeInTheDocument(),
    );
  });

  test("offers another link for an address already waiting", async () => {
    const user = userEvent.setup();
    renderWithToaster(
      <NotificationEmailForm {...props} pendingEmail="ops@chattersnow.test" />,
    );

    await user.click(screen.getByRole("button", { name: "Send another link" }));

    await waitFor(() =>
      expect(resendMock).toHaveBeenCalledWith("ops@chattersnow.test"),
    );
  });

  test("clearing takes effect without a confirmation", async () => {
    const user = userEvent.setup();
    saveMock.mockImplementation(async () => ({
      success: true,
      outcome: "cleared",
      pendingEmail: null,
    }));
    renderWithToaster(
      <NotificationEmailForm
        {...props}
        notificationEmail="ops@chattersnow.test"
        pendingEmail="later@chattersnow.test"
      />,
    );

    await user.clear(screen.getByLabelText("Send them to"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledWith(""));
    expect(screen.queryByText(/is waiting to be confirmed/i)).toBeNull();
  });
});
