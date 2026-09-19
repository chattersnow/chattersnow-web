import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import { mockUrlTabState } from "../../../../../../test/url-tab-state-mock";
import type { AutoReplyPreview } from "./preview-actions";

/**
 * The preview pane (#1236): that it shows the email, that the plain-text part
 * is reachable, that the headers are named -- and that the test-send button
 * asks for a reply and a wording and never for an address.
 */

const PREVIEW: AutoReplyPreview = {
  subject: "You're registered for Spring Tune-Up Day",
  html: "<div><p>Hi Alexandra,</p><p>Tea &amp; biscuits</p></div>",
  text: "Hi Alexandra,\n\nTea & biscuits",
  from: '"Riverside Community Center" <notifications@example.org>',
  replyTo: "hello@riverside.example",
  to: "someone@example.org",
  testSendTo: "admin@riverside.example",
  hasImages: false,
};

let previewResult: { error: string } | { preview: AutoReplyPreview } = {
  preview: PREVIEW,
};

const renderMock = mock(
  async (_kind: string, _slots: Record<string, string>) => previewResult,
);
const sendMock = mock(
  async (_kind: string, _slots: Record<string, string>) => ({
    sentTo: "admin@riverside.example",
    logged: false,
  }),
);

mockUrlTabState();
mock.module("./preview-actions", () => ({
  renderAutoReplyPreviewAction: renderMock,
}));
mock.module("./test-send-actions", () => ({
  sendAutoReplyTestAction: sendMock,
}));

const { AutoReplyPreviewPanel } = await import("./preview-panel");

function renderPanel(
  props: Partial<{
    slots: Record<string, string>;
    enabled: boolean;
    emailEnabled: boolean;
  }> = {},
) {
  return renderWithToaster(
    <AutoReplyPreviewPanel
      kind="event_registration_confirmation"
      label="Event registration confirmation"
      slots={props.slots ?? {}}
      enabled={props.enabled ?? true}
      emailEnabled={props.emailEnabled ?? true}
    />,
  );
}

/** The pane debounces, so nothing is on screen until the action has answered. */
async function paneReady(): Promise<HTMLIFrameElement> {
  return (await screen.findByTitle(
    "Event registration confirmation, as it would be received",
  )) as HTMLIFrameElement;
}

beforeEach(() => {
  previewResult = { preview: PREVIEW };
  renderMock.mockClear();
  sendMock.mockClear();
});

describe("the email", () => {
  test("renders in a sandboxed iframe rather than in the page", async () => {
    renderPanel();
    const frame = await paneReady();

    // The empty allow-list: no scripts, no forms, no same-origin. Tenant copy
    // must not be able to reach the portal's DOM even if the escaping is wrong.
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("Hi Alexandra,");
  });

  test("the plain-text part is a tab beside it", async () => {
    renderPanel();
    await paneReady();

    await userEvent.click(screen.getByRole("tab", { name: "Plain text" }));

    // Unescaped, which is what a text client reads: `&amp;` here is the bug.
    expect(await screen.findByText(/Tea & biscuits/)).toBeTruthy();
  });

  test("the headers say where a reply would go", async () => {
    renderPanel();
    await paneReady();

    expect(
      screen.getByText(
        '"Riverside Community Center" <notifications@example.org>',
      ),
    ).toBeTruthy();
    expect(screen.getByText("hello@riverside.example")).toBeTruthy();
    expect(screen.getByText("someone@example.org")).toBeTruthy();
  });

  test("re-renders when the wording changes", async () => {
    const { rerender } = renderPanel();
    await paneReady();
    expect(renderMock).toHaveBeenCalledTimes(1);

    rerender(
      <AutoReplyPreviewPanel
        kind="event_registration_confirmation"
        label="Event registration confirmation"
        slots={{ subject: "A new subject" }}
        enabled
        emailEnabled
      />,
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    expect(renderMock.mock.calls[1][1]).toEqual({ subject: "A new subject" });
  });

  test("a failure is said rather than left as an empty pane", async () => {
    previewResult = { error: "Nothing to preview against." };
    renderPanel();

    expect(await screen.findByText("Nothing to preview against.")).toBeTruthy();
  });
});

describe("the notices", () => {
  test("the org-wide switch being off is said, and the email still renders", async () => {
    renderPanel({ emailEnabled: false });
    await paneReady();

    expect(screen.getByText(/Outbound email is off/)).toBeTruthy();
  });

  test("this one reply being off is said too", async () => {
    renderPanel({ enabled: false });
    await paneReady();

    expect(screen.getByText(/This reply is switched off/)).toBeTruthy();
  });
});

describe("the test send", () => {
  test("names where it goes, and asks the action for nothing but the copy", async () => {
    renderPanel({ slots: { subject: "Mine" } });
    await paneReady();

    expect(
      screen.getByText(
        "A test goes to admin@riverside.example and nobody else.",
      ),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: /Send myself a test/ }),
    );

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    // Two arguments and neither is an address: the recipient is resolved on
    // the server from the caller's own record.
    expect(sendMock.mock.calls[0]).toEqual([
      "event_registration_confirmation",
      { subject: "Mine" },
    ]);
  });

  test("an account with no address cannot press it", async () => {
    previewResult = { preview: { ...PREVIEW, testSendTo: null } };
    renderPanel();
    await paneReady();

    expect(
      screen.getByRole("button", { name: /Send myself a test/ }),
    ).toBeDisabled();
  });
});
