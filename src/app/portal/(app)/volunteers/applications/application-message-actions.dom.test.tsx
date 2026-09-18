// #1204: what the composer opens with on this queue. The subject is the first
// thing an applicant sees in their inbox, and it has to name the organization
// rather than the portal -- a message from an unnamed sender about an
// unnamed application is the one nobody opens.
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// Everything else in next/navigation is kept: the action module this island
// imports reaches redirect() through the auth helpers, and a mock that
// replaced the whole module would break the import rather than the router.
const nextNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...nextNavigation,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  }),
}));
mock.module("@/components/ui/toast", () => ({
  toast: {
    success: mock(() => ""),
    error: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));
// The island imports its Server Actions, and through them the `server-only`
// sender. Next's bundler replaces that module with action references for a
// client component; under bun it is imported for real.
mock.module("server-only", () => ({}));

const { VolunteerApplicationMessageActions } =
  await import("./application-message-actions");

function renderActions(
  props: { orgName?: string; disabledReason?: string } = {},
) {
  render(
    <VolunteerApplicationMessageActions
      applicationId="11111111-1111-4111-8111-111111111111"
      applicantName="Priya Nandakumar"
      toEmail="priya.n@example.test"
      orgName={props.orgName ?? "Chatter Snow"}
      replyTo="hello@chattersnow.org"
      disabledReason={props.disabledReason}
    />,
  );
}

describe("VolunteerApplicationMessageActions", () => {
  test("opens on a subject naming the organization and the application", async () => {
    renderActions();
    await userEvent.click(
      screen.getByRole("button", { name: "Message applicant" }),
    );

    expect(
      (screen.getByRole("textbox", { name: /Subject/ }) as HTMLInputElement)
        .value,
    ).toBe("Your volunteer application — Chatter Snow");
    expect(screen.getByText(/priya\.n@example\.test/)).toBeDefined();
    expect(screen.getByText(/hello@chattersnow\.org/)).toBeDefined();
  });

  test("drops the suffix rather than trailing an em dash into nothing", async () => {
    renderActions({ orgName: "" });
    await userEvent.click(
      screen.getByRole("button", { name: "Message applicant" }),
    );

    expect(
      (screen.getByRole("textbox", { name: /Subject/ }) as HTMLInputElement)
        .value,
    ).toBe("Your volunteer application");
  });

  test("says why both buttons are off rather than hiding them", () => {
    renderActions({
      disabledReason: "Outbound email is switched off for this organization.",
    });

    expect(
      screen.getByText("Outbound email is switched off for this organization."),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Resend confirmation" }),
    ).toHaveProperty("disabled", true);
  });
});
