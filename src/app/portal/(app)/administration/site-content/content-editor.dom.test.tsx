import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import type {
  ContentPage,
  ContentSection,
  ContentSlot,
} from "@/lib/site-content";
import type { EditorSlot, OutlineEntry } from "./content-shared";

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

const SECTIONS: ContentSection[] = [
  { key: "home:hero", page: "home", label: "Hero" },
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

const INTRO: ContentSlot = {
  key: "home.intro",
  page: "home",
  section: "home:hero",
  label: "Introduction",
  type: "text",
  default: "Come ride with us.",
};

const VALUES: ContentSlot = {
  key: "home.values",
  page: "home",
  section: "home:hero",
  label: "Values",
  type: "list",
  fields: [{ key: "name", label: "Value", kind: "text" }],
  default: [],
};

const PRIVACY: ContentSlot = {
  key: "legal.privacy",
  page: "home",
  section: "home:hero",
  label: "Privacy policy",
  type: "document",
  default: null,
  route: "/privacy",
};

function editorSlot(
  slot: ContentSlot,
  value: unknown,
  overridden = false,
): EditorSlot {
  return { slot, value, overridden };
}

/** What the server sends for the twelve pages that are not being edited. */
const OTHER_PAGE: OutlineEntry = {
  page: "contact",
  section: "contact:opening",
  key: "contact.intro",
  label: "Introduction",
  overridden: false,
  text: "Ask us anything about a rutabaga.",
};

function outlineFor(slots: EditorSlot[]): OutlineEntry[] {
  return [
    ...slots.map(({ slot, overridden }) => ({
      page: slot.page,
      section: slot.section,
      key: slot.key,
      label: slot.label,
      overridden,
      text: "",
    })),
    OTHER_PAGE,
  ];
}

function renderEditor(slots: EditorSlot[], hiddenPages: string[] = []) {
  const props = (next: EditorSlot[]) => ({
    page: PAGES[0],
    pages: PAGES,
    sections: SECTIONS,
    slots: next,
    outline: outlineFor(next),
    hiddenPages,
    canEdit: true,
  });
  const view = renderWithToaster(<ContentEditor {...props(slots)} />);
  return {
    ...view,
    /** Re-render with what the server would send after `router.refresh()`. */
    refreshWith(next: EditorSlot[]) {
      view.rerender(<ContentEditor {...props(next)} />);
    },
  };
}

/** The rail's page list, which is where the page switcher now lives. */
function pageSwitch(label: string) {
  return within(screen.getByRole("navigation", { name: "Pages" })).getByRole(
    "link",
    { name: new RegExp(label) },
  );
}

function saveBar() {
  return screen.getByRole("button", { name: "Save changes" });
}

beforeEach(() => {
  pushMock.mockClear();
  refreshMock.mockClear();
  resetMock.mockClear();
});

describe("Back to default", () => {
  test("puts the registry default back in the field instead of the reverted text", async () => {
    const view = renderEditor([editorSlot(HEADING, "Our own heading", true)]);

    const field = screen.getByRole("textbox", { name: /Heading/ });
    expect(field).toHaveValue("Our own heading");

    await userEvent.click(
      screen.getByRole("button", { name: "Back to default" }),
    );

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("home.heading"));
    // Leaving the old text in place showed words that were no longer
    // published, and armed Save to write them straight back.
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /Heading/ })).toHaveValue(
        DEFAULT_HEADING,
      ),
    );

    // Once the refresh lands, the form is clean rather than offering to save.
    view.refreshWith([editorSlot(HEADING, DEFAULT_HEADING, false)]);
    expect(saveBar()).toBeDisabled();
    expect(screen.getByText("No unsaved changes.")).toBeInTheDocument();
  });
});

describe("switching page with unsaved edits", () => {
  test("asks before discarding, and only navigates once confirmed", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(
      screen.getByRole("textbox", { name: /Heading/ }),
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
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.click(pageSwitch("Contact"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Nothing was intercepted, so Next's own Link navigation runs.
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("single-line vs multi-line text controls", () => {
  test("uses a textarea when the tenant's own value is long, not just the default", () => {
    renderEditor([editorSlot(HEADING, LONG, true)]);

    expect(screen.getByRole("textbox", { name: /Heading/ }).tagName).toBe(
      "TEXTAREA",
    );
  });

  test("stays a single-line input while the default and the value are short", () => {
    renderEditor([editorSlot(HEADING, "Short", true)]);

    expect(screen.getByRole("textbox", { name: /Heading/ }).tagName).toBe(
      "INPUT",
    );
  });
});

describe("the save bar", () => {
  test("counts the changed slots and Discard puts every one of them back", async () => {
    renderEditor([
      editorSlot(HEADING, DEFAULT_HEADING),
      editorSlot(INTRO, "Come ride with us."),
    ]);

    expect(saveBar()).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: /Heading/ }), "!");
    expect(screen.getByText("1 unsaved change.")).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Introduction/ }),
      "!",
    );
    expect(screen.getByText("2 unsaved changes.")).toBeInTheDocument();
    expect(saveBar()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByRole("textbox", { name: /Heading/ })).toHaveValue(
      DEFAULT_HEADING,
    );
    expect(screen.getByRole("textbox", { name: /Introduction/ })).toHaveValue(
      "Come ride with us.",
    );
    expect(screen.getByText("No unsaved changes.")).toBeInTheDocument();
  });

  test("marks the changed slot in the rail as well as beside the field", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(screen.getByRole("textbox", { name: /Heading/ }), "!");

    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(within(rail).getByText("Unsaved")).toBeInTheDocument();
  });
});

describe("searching every page at once", () => {
  test("finds a slot on another page and asks before leaving for it", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(screen.getByRole("textbox", { name: /Heading/ }), "!");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search all site content" }),
      "rutabaga",
    );

    const results = screen.getByRole("navigation", { name: "Search results" });
    const hit = within(results).getByRole("link", { name: /Contact/ });

    await userEvent.click(hit);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Discard changes?",
    );
  });

  test("says so when nothing matches", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search all site content" }),
      "nothing here matches this",
    );

    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });
});

describe("the list editor", () => {
  const items = [{ name: "Joy" }, { name: "Access" }];

  test("moves an item up without disturbing the others", async () => {
    renderEditor([editorSlot(VALUES, items, true)]);

    await userEvent.click(
      screen.getByRole("button", { name: "Move Access up" }),
    );

    const fields = screen.getAllByRole("textbox", { name: "Value" });
    expect(fields.map((field) => (field as HTMLInputElement).value)).toEqual([
      "Access",
      "Joy",
    ]);
    expect(screen.getByText("1 unsaved change.")).toBeInTheDocument();
  });

  test("cannot move the first item up or the last one down", () => {
    renderEditor([editorSlot(VALUES, items, true)]);

    expect(screen.getByRole("button", { name: "Move Joy up" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Access down" }),
    ).toBeDisabled();
  });

  test("asks before removing an item", async () => {
    renderEditor([editorSlot(VALUES, items, true)]);

    expect(screen.getAllByRole("textbox", { name: "Value" })).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Remove Joy" }));

    // The dialog is modal, so the form behind it is out of the accessibility
    // tree while it is open -- the item surviving is what the confirm step is
    // for, and is asserted once the dialog closes.
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Remove Joy?",
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getAllByRole("textbox", { name: "Value" })).toHaveLength(2),
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove Joy" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("textbox", { name: "Value" })).toHaveLength(1),
    );
    expect(
      (screen.getByRole("textbox", { name: "Value" }) as HTMLInputElement)
        .value,
    ).toBe("Access");
  });
});

describe("legal documents", () => {
  test("starting from the outline seeds the platform document's headings", async () => {
    renderEditor([editorSlot(PRIVACY, null)]);

    await userEvent.click(
      screen.getByRole("button", { name: "Start from the outline" }),
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Privacy Policy",
    );
    const headings = screen.getAllByRole("textbox", { name: "Heading" });
    expect((headings[0] as HTMLInputElement).value).toBe(
      "What we collect, and why",
    );
    // Headings only -- the platform's text is not a tenant's to publish.
    expect(screen.getAllByRole("textbox", { name: "Text" })[0]).toHaveValue("");
  });

  test("starting blank leaves the title empty", async () => {
    renderEditor([editorSlot(PRIVACY, null)]);

    await userEvent.click(screen.getByRole("button", { name: "Start blank" }));

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(screen.queryAllByRole("textbox", { name: "Heading" })).toHaveLength(
      0,
    );
  });
});

describe("a page that is hidden from the public site", () => {
  test("says so, rather than leaving copy written for a page nobody can reach", () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)], ["home"]);

    expect(
      screen.getByText(/Home is hidden from the public site/),
    ).toBeInTheDocument();
  });

  test("says nothing when the page is live", () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    expect(screen.queryByText(/hidden from the public site/)).toBeNull();
  });
});
