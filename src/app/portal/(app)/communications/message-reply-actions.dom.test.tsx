// #1204: replying to somebody who wrote in. The subject is the writer's own
// topic prefixed "Re:", so their reply threads in their mail client against
// the message they sent -- and nothing of theirs is quoted back, since they
// have their own copy.
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
mock.module("server-only", () => ({}));

const { ContactMessageReplyActions } = await import("./message-reply-actions");

function renderActions(props: { disabledReason?: string } = {}) {
  render(
    <ContactMessageReplyActions
      contactMessageId="22222222-2222-4222-8222-222222222222"
      senderName="Drew Sato"
      toEmail="drew.sato@example.test"
      topicLabel="Volunteering"
      replyTo="hello@chattersnow.org"
      disabledReason={props.disabledReason}
    />,
  );
}

describe("ContactMessageReplyActions", () => {
  test("opens on Re: plus the topic the writer chose", async () => {
    renderActions();
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect(
      (screen.getByRole("textbox", { name: /Subject/ }) as HTMLInputElement)
        .value,
    ).toBe("Re: Volunteering");
    // Nothing of the original message is quoted into the body.
    expect(
      (screen.getByRole("textbox", { name: /Message/ }) as HTMLTextAreaElement)
        .value,
    ).toBe("");
  });

  test("offers no resend: a contact message has no receipt of its own", async () => {
    renderActions();
    expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
  });

  test("says why the button is off rather than hiding it", () => {
    renderActions({
      disabledReason: "This message has no email address to reply to.",
    });

    expect(
      screen.getByText("This message has no email address to reply to."),
    ).toBeDefined();
  });
});
