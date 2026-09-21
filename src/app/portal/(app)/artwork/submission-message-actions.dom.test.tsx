// #1309: what the composer opens with on this queue. An artist may have
// answered several open calls, so "Your submission" alone does not say which
// piece a curator is writing about -- the call has to be in the subject line.
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

const { ArtworkSubmissionMessageActions, artworkMessageSubject } =
  await import("./submission-message-actions");

function renderActions(
  props: {
    orgName?: string;
    callTitle?: string;
    toEmail?: string;
    disabledReason?: string;
  } = {},
) {
  render(
    <ArtworkSubmissionMessageActions
      submissionId="22222222-2222-4222-8222-222222222222"
      artistName="Priya Nandakumar"
      toEmail={props.toEmail ?? "priya.n@example.test"}
      callTitle={props.callTitle ?? "Winter zine"}
      orgName={props.orgName ?? "Chatter Snow"}
      replyTo="hello@chattersnow.org"
      disabledReason={props.disabledReason}
    />,
  );
}

describe("artworkMessageSubject", () => {
  test("names the call and the organization", () => {
    expect(artworkMessageSubject("Winter zine", "Chatter Snow")).toBe(
      "Your submission to Winter zine — Chatter Snow",
    );
  });

  test("drops each part rather than leaving a dangling dash", () => {
    expect(artworkMessageSubject("Winter zine", "")).toBe(
      "Your submission to Winter zine",
    );
    expect(artworkMessageSubject("", "Chatter Snow")).toBe(
      "Your artwork submission — Chatter Snow",
    );
    expect(artworkMessageSubject("  ", "  ")).toBe("Your artwork submission");
  });
});

describe("ArtworkSubmissionMessageActions", () => {
  test("opens on a subject naming the call and the organization", async () => {
    renderActions();
    await userEvent.click(
      screen.getByRole("button", { name: "Contact artist" }),
    );

    expect(
      (screen.getByRole("textbox", { name: /Subject/ }) as HTMLInputElement)
        .value,
    ).toBe("Your submission to Winter zine — Chatter Snow");
    expect(screen.getByText(/priya\.n@example\.test/)).toBeDefined();
    expect(screen.getByText(/hello@chattersnow\.org/)).toBeDefined();
  });

  test("says why both buttons are off rather than hiding them", () => {
    renderActions({
      toEmail: "",
      disabledReason: "This submission has no email address to write to.",
    });

    expect(
      screen.getByText("This submission has no email address to write to."),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Contact artist" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Resend acknowledgement" }),
    ).toHaveProperty("disabled", true);
  });
});
