import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import type { ContentPage, ContentSlot } from "@/lib/site-content";
import type { EditorSlot } from "./content-editor";

const pushMock = mock((_href: string) => {});
const refreshMock = mock(() => {});
// One stable object, as the real useRouter returns.
const routerMock = { push: pushMock, refresh: refreshMock };
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => routerMock,
}));

const resetMock = mock(
  async (_key: string): Promise<{ error: string } | { success: true }> => ({
    success: true,
  }),
);
// Mocked wholesale: actions.ts reaches the server Supabase client, which
// throws when pulled into a client-component module graph.
mock.module("./actions", () => ({
  resetSiteContentAction: resetMock,
  saveSiteContentAction: async () => ({ success: true }) as const,
}));

const { ContentEditor } = await import("./content-editor");

const PAGES: ContentPage[] = [
  { key: "home", label: "Home", route: "/home" },
  { key: "contact", label: "Contact", route: "/contact" },
];

const DEFAULT_HEADING = "A queer ski & snowboard community";
const LONG = "x".repeat(120);

const HEADING: ContentSlot = {
  key: "home.heading",
  page: "home",
  section: "home:hero",
  label: "Heading",
  type: "text",
  default: DEFAULT_HEADING,
};

function editorSlot(value: unknown, overridden: boolean): EditorSlot {
  return { slot: HEADING, value, overridden };
}

function renderEditor(slots: EditorSlot[]) {
  const view = renderWithToaster(
    <ContentEditor page={PAGES[0]} pages={PAGES} slots={slots} canEdit />,
  );
  return {
    ...view,
    /** Re-render with what the server would send after `router.refresh()`. */
    refreshWith(next: EditorSlot[]) {
      view.rerender(
        <ContentEditor page={PAGES[0]} pages={PAGES} slots={next} canEdit />,
      );
    },
  };
}

/**
 * The page switcher renders anchors that shadcn's Button labels
 * `role="button"`, so they are queried as buttons rather than links.
 */
function pageSwitch(label: string) {
  return screen.getByRole("button", { name: label });
}

beforeEach(() => {
  pushMock.mockClear();
  refreshMock.mockClear();
  resetMock.mockClear();
});

describe("Back to default", () => {
  test("puts the registry default back in the field instead of the reverted text", async () => {
    const view = renderEditor([editorSlot("Our own heading", true)]);

    const field = screen.getByRole("textbox", { name: "Heading" });
    expect(field).toHaveValue("Our own heading");

    await userEvent.click(
      screen.getByRole("button", { name: "Back to default" }),
    );

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("home.heading"));
    // Leaving the old text in place showed words that were no longer
    // published, and armed Save to write them straight back.
    await waitFor(() => expect(field).toHaveValue(DEFAULT_HEADING));

    // Once the refresh lands, the form is clean rather than offering to save.
    view.refreshWith([editorSlot(DEFAULT_HEADING, false)]);
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });
});

describe("switching page with unsaved edits", () => {
  test("asks before discarding, and only navigates once confirmed", async () => {
    renderEditor([editorSlot(DEFAULT_HEADING, false)]);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Heading" }),
      " edited",
    );
    await userEvent.click(pageSwitch("Contact"));

    expect(pushMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Discard changes?",
    );

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(pushMock).not.toHaveBeenCalled();

    await userEvent.click(pageSwitch("Contact"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/portal/administration/site-content?page=contact",
      ),
    );
  });

  test("lets the link through untouched when nothing is unsaved", async () => {
    renderEditor([editorSlot(DEFAULT_HEADING, false)]);

    await userEvent.click(pageSwitch("Contact"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Nothing was intercepted, so Next's own Link navigation runs.
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("single-line vs multi-line text controls", () => {
  test("uses a textarea when the tenant's own value is long, not just the default", () => {
    renderEditor([editorSlot(LONG, true)]);

    expect(screen.getByRole("textbox", { name: "Heading" }).tagName).toBe(
      "TEXTAREA",
    );
  });

  test("stays a single-line input while the default and the value are short", () => {
    renderEditor([editorSlot("Short", true)]);

    expect(screen.getByRole("textbox", { name: "Heading" }).tagName).toBe(
      "INPUT",
    );
  });
});
