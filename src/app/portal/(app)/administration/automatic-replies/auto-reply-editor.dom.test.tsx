import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { useEffect, useReducer } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import {
  autoReplyDefinition,
  type AutoReplySlotKey,
} from "@/lib/notifications/auto-replies";

const saveMock = mock(
  async (_kind: string, _slots: Record<string, string>) =>
    ({ success: true }) as const,
);
const enabledMock = mock(
  async (_kind: string, _enabled: boolean) => ({ success: true }) as const,
);

/**
 * The URL, for real.
 *
 * The selection lives in `?reply=` through `useUrlTabState`, which writes it
 * with `history.pushState` and reads it back through `useSearchParams` -- so
 * a mock that returns a frozen `URLSearchParams` would leave the editor
 * permanently on the first reply and quietly pass a test that asserts a
 * switch happened. This one re-reads the pushed URL and re-renders, which is
 * what the browser does.
 */
let params = new URLSearchParams();
const listeners = new Set<() => void>();

function useSearchParamsMock() {
  const [, bump] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return params;
}

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  usePathname: () => "/portal/administration/automatic-replies",
  useSearchParams: useSearchParamsMock,
  useRouter: () => ({ refresh() {} }),
}));
mock.module("./actions", () => ({
  saveAutoReplyCopyAction: saveMock,
  setAutoReplyEnabledAction: enabledMock,
}));

// The preview pane (#1236) reaches two `"use server"` modules and, through
// them, `server-only` -- which throws outside Next's bundler. Nothing here is
// about the preview; it has a test of its own beside this one.
mock.module("./preview-panel", () => ({
  AutoReplyPreviewPanel: () => null,
}));

const { AutoReplyEditor } = await import("./auto-reply-editor");

const EVENT = autoReplyDefinition("event_registration_confirmation")!;
const VOLUNTEER = autoReplyDefinition("volunteer_application_confirmation")!;

function defaultFor(kind: string, slot: AutoReplySlotKey): string {
  return autoReplyDefinition(kind)!.slots.find((entry) => entry.key === slot)!
    .default;
}

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function renderEditor(
  saved: Record<
    string,
    { enabled: boolean; slots: Record<string, string> }
  > = {},
) {
  return renderWithToaster(
    <AutoReplyEditor device="desktop" saved={saved} emailEnabled />,
  );
}

const realPushState = window.history.pushState.bind(window.history);

beforeEach(() => {
  saveMock.mockClear();
  enabledMock.mockClear();
  window.history.pushState = ((_state, _title, url) => {
    params = new URLSearchParams(String(url).split("?")[1] ?? "");
    for (const listener of listeners) listener();
  }) as typeof window.history.pushState;
});

afterEach(() => {
  window.history.pushState = realPushState;
  params = new URLSearchParams();
});

describe("AutoReplyEditor (#1235)", () => {
  test("a tenant with no rows reads as prefilled, not empty", () => {
    renderEditor();

    // The whole point of the sparse `slots` object: nothing is stored, and
    // every field still shows the email that is going out today.
    for (const slot of EVENT.slots) {
      expect(field(slot.label).value).toBe(slot.default);
    }
    expect(
      screen.getByText("Every field is the platform's wording."),
    ).toBeInTheDocument();
  });

  test("a stored slot wins, and only that slot", () => {
    renderEditor({
      [EVENT.kind]: { enabled: true, slots: { subject: "See you there" } },
    });

    expect(field("Subject").value).toBe("See you there");
    expect(field("Intro").value).toBe(defaultFor(EVENT.kind, "intro"));
    expect(screen.getByText("1 field written by you.")).toBeInTheDocument();
  });

  test("saves only the slots that were rewritten", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(field("Subject"));
    await user.type(field("Subject"), "You are in");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0]).toEqual([
      EVENT.kind,
      { subject: "You are in" },
    ]);
  });

  test("reset removes the key rather than writing the default in", async () => {
    const user = userEvent.setup();
    renderEditor({
      [EVENT.kind]: { enabled: true, slots: { subject: "See you there" } },
    });

    await user.click(
      screen.getByRole("button", { name: "Back to the platform’s wording" }),
    );
    expect(field("Subject").value).toBe(defaultFor(EVENT.kind, "subject"));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    // `{}`, not `{ subject: "You're registered for {{event_name}}" }` -- a
    // tenant who resets goes back to tracking the default as it improves.
    expect(saveMock.mock.calls[0]).toEqual([EVENT.kind, {}]);
  });

  test("a bad token is refused with a message naming the slot", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Pasted, not typed: userEvent reads `{{` in a typed string as an escaped
    // single brace, which is the one thing this test must not do.
    await user.clear(field("Greeting"));
    await user.click(field("Greeting"));
    await user.paste("Hi {{first_nmae}},");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText(/Greeting uses \{\{first_nmae\}\}/),
    ).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  test("a token chip says what it resolves to, and inserts it", async () => {
    const user = userEvent.setup();
    renderEditor();

    const subject = field("Subject");
    await user.clear(subject);
    await user.click(
      screen.getByRole("button", {
        name: "Insert {{org_name}} into Subject — Your organization's name.",
      }),
    );

    expect(subject.value).toBe("{{org_name}}");
  });

  test("counts characters against the slot's own limit", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(field("Subject"));
    await user.type(field("Subject"), "Hello");
    expect(screen.getByText("5 of 200 characters")).toBeInTheDocument();
  });

  test("turning a reply off explains what stops working first", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ reply: VOLUNTEER.kind });
    renderEditor();

    await user.click(screen.getByRole("switch", { name: "Send this reply" }));

    // The reference code is the only key to the volunteer status page, and
    // the per-email guard means a re-application cannot mint another for a
    // day. A dialog that said only "are you sure?" would not have said it.
    expect(screen.getByText(/only place that code exists/)).toBeInTheDocument();
    expect(enabledMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Turn it off" }));
    await waitFor(() => expect(enabledMock).toHaveBeenCalled());
    expect(enabledMock.mock.calls[0]).toEqual([VOLUNTEER.kind, false]);
  });

  test("turning one back on asks nothing", async () => {
    const user = userEvent.setup();
    renderEditor({ [EVENT.kind]: { enabled: false, slots: {} } });

    await user.click(screen.getByRole("switch", { name: "Send this reply" }));
    await waitFor(() => expect(enabledMock).toHaveBeenCalled());
    expect(enabledMock.mock.calls[0]).toEqual([EVENT.kind, true]);
  });

  test("switching replies with unsaved edits asks before discarding", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(field("Subject"), "!");
    await user.click(screen.getByRole("button", { name: VOLUNTEER.label }));

    // Still on the event reply, with the edit intact, until the question is
    // answered -- there is no saved draft here to come back to.
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(field("Subject").value).toBe(
      `${defaultFor(EVENT.kind, "subject")}!`,
    );

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(field("Subject").value).toBe(defaultFor(VOLUNTEER.kind, "subject"));
  });
});
