import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  configure,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../../test/toast-testing";
import { platformLegalDocument } from "@/lib/legal-defaults";
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

type ActionResult = { error: string } | { success: true };

/**
 * How long any wait in this file is given.
 *
 * Every one sits behind a server action and a re-render of a whole page of
 * slots, on a runner doing the same for the rest of the suite in parallel.
 * `waitFor`'s default second is measured against this machine, where these
 * waits resolve in tens of milliseconds; the runner that failed twice is
 * slower than that by more than the margin the default leaves. A wait that
 * succeeds costs nothing, so the budget is set by what a real stall would
 * exceed rather than by what a pass needs.
 */
const ACTION_TIMEOUT_MS = 5_000;

configure({ asyncUtilTimeout: ACTION_TIMEOUT_MS });

/**
 * Waits for a save's transition to close.
 *
 * `saveMock` records the call before its promise resolves, so waiting for the
 * mock leaves the action still running and the bar still reading "Saving...".
 * The bar coming back is the reader's own signal that the save is over, and so
 * the point at which a refresh stands for the server's answer arriving after
 * the save rather than during it.
 */
function saveSettled() {
  return screen.findByRole("button", { name: "Save draft" });
}

const saveMock = mock(
  async (_entries: { key: string; value: unknown }[]): Promise<ActionResult> =>
    ({ success: true }) as const,
);
const publishMock = mock(
  async (_keys: string[]): Promise<ActionResult> =>
    ({ success: true }) as const,
);
const discardMock = mock(
  async (_keys: string[]): Promise<ActionResult> =>
    ({ success: true }) as const,
);
// Mocked wholesale: actions.ts reaches the server Supabase client, which
// throws when pulled into a client-component module graph.
mock.module("./actions", () => ({
  saveSiteContentDraftAction: saveMock,
  publishSiteContentAction: publishMock,
  discardSiteContentDraftAction: discardMock,
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

const CAROUSEL: ContentSlot = {
  key: "site_images.home_carousel_1",
  page: "home",
  section: "home:hero",
  label: "Homepage carousel — slide 1",
  type: "image",
  default: null,
  ratio: "21/9",
};

const PHOTO_URL = "https://example.test/carousel-1.jpg";

function editorSlot(
  slot: ContentSlot,
  value: unknown,
  overridden = false,
  hasDraft = false,
): EditorSlot {
  return {
    slot,
    value,
    // What the public sees: the draft's value is not it, so a slot with a
    // pending draft is published as whatever it was before.
    published: hasDraft ? slot.default : overridden ? value : slot.default,
    overridden,
    hasDraft,
    draftUpdatedAt: hasDraft ? "2026-09-07T10:00:00Z" : null,
    draftUpdatedBy: hasDraft ? "Robin" : null,
    publishedAt: overridden ? "2026-09-01T10:00:00Z" : null,
    publishedBy: overridden ? "Alex" : null,
    starter:
      slot.type === "document"
        ? platformLegalDocument(slot.key, {
            name: "Example Nonprofit",
            emailGeneral: "hello@example.org",
            emailPrivacy: "privacy@example.org",
            emailConduct: "conduct@example.org",
          })
        : null,
  };
}

/** What the server sends for the twelve pages that are not being edited. */
const OTHER_PAGE: OutlineEntry = {
  page: "contact",
  section: "contact:opening",
  key: "contact.intro",
  label: "Introduction",
  image: false,
  overridden: false,
  hasDraft: false,
  text: "Ask us anything about a rutabaga.",
};

function outlineFor(slots: EditorSlot[]): OutlineEntry[] {
  return [
    ...slots.map(({ slot, overridden, hasDraft }) => ({
      page: slot.page,
      section: slot.section,
      key: slot.key,
      label: slot.label,
      image: slot.type === "image",
      overridden,
      hasDraft,
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
    programsFromModule: false,
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
  return screen.getByRole("button", { name: "Save draft" });
}

function publishBar() {
  return screen.getByRole("button", { name: "Publish" });
}

beforeEach(() => {
  pushMock.mockClear();
  refreshMock.mockClear();
  saveMock.mockClear();
  publishMock.mockClear();
  discardMock.mockClear();
});

describe("Back to default", () => {
  test("puts the registry default back in the field, staged rather than published", async () => {
    const view = renderEditor([editorSlot(HEADING, "Our own heading", true)]);

    expect(screen.getByRole("textbox", { name: /Heading/ })).toHaveValue(
      "Our own heading",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Back to default" }),
    );

    // Local now: the revert is a draft like any other edit, and the site keeps
    // serving the old words until it is published (#793).
    expect(screen.getByRole("textbox", { name: /Heading/ })).toHaveValue(
      DEFAULT_HEADING,
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("1 change not published yet.")).toBeInTheDocument();

    await userEvent.click(saveBar());
    // A value back at the registry default is stored as a null draft, so the
    // row reverts on publish instead of keeping a copy of the default.
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith([
        { key: "home.heading", value: null },
      ]),
    );

    await saveSettled();

    view.refreshWith([editorSlot(HEADING, DEFAULT_HEADING, false)]);
    expect(saveBar()).toBeDisabled();
    expect(
      screen.getByText("Everything here is published."),
    ).toBeInTheDocument();
  });
});

describe("saving and publishing are two steps", () => {
  test("saving stores a draft and leaves the public site alone", async () => {
    const view = renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(screen.getByRole("textbox", { name: /Heading/ }), "!");
    await userEvent.click(saveBar());

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith([
        { key: "home.heading", value: `${DEFAULT_HEADING}!` },
      ]),
    );
    expect(publishMock).not.toHaveBeenCalled();

    await saveSettled();

    // The server comes back with the draft staged; the copy is still not live.
    view.refreshWith([editorSlot(HEADING, `${DEFAULT_HEADING}!`, false, true)]);
    expect(saveBar()).toBeDisabled();
    expect(screen.getByText("1 change not published yet.")).toBeInTheDocument();
    // Said twice on purpose, beside the field and in the rail, the same way
    // "Unsaved" is.
    expect(screen.getAllByText("Not published")).toHaveLength(2);
  });

  test("publishing shows what changes before it changes it", async () => {
    renderEditor([editorSlot(HEADING, `${DEFAULT_HEADING}!`, false, true)]);

    await userEvent.click(publishBar());

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Publish this change?");
    // The words coming off the site, then the words going on.
    expect(within(dialog).getByText(DEFAULT_HEADING)).toBeInTheDocument();
    expect(within(dialog).getByText(`${DEFAULT_HEADING}!`)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish" }),
    );
    await waitFor(() =>
      expect(publishMock).toHaveBeenCalledWith(["home.heading"]),
    );
  });

  test("publishing an unsaved edit stages it first, so the diff shown is the diff that lands", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(
      screen.getByRole("textbox", { name: /Heading/ }),
      " today",
    );
    await userEvent.click(publishBar());
    // `findByRole` inside the dialog as well as for the dialog itself: the
    // dialog element reaches the document a tick before its contents do, and a
    // synchronous lookup for the button can land in that gap. It would throw
    // inside the promise chain rather than at an assertion, so the test hangs
    // to the runner's own timeout instead of naming the missing element --
    // which is how it presented while this file was under investigation.
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Publish" }),
    );

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith([
        { key: "home.heading", value: `${DEFAULT_HEADING} today` },
      ]),
    );
    // Staging and publishing are two round trips, so the second one is still
    // in front of us when the first is recorded.
    await waitFor(() =>
      expect(publishMock).toHaveBeenCalledWith(["home.heading"]),
    );
  });

  test("Discard drops the saved draft as well as the edits on screen", async () => {
    renderEditor([editorSlot(HEADING, `${DEFAULT_HEADING}!`, false, true)]);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(discardMock).toHaveBeenCalledWith(["home.heading"]),
    );
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
    expect(screen.getByText("1 change not published yet.")).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Introduction/ }),
      "!",
    );
    expect(
      screen.getByText("2 changes not published yet."),
    ).toBeInTheDocument();
    expect(saveBar()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByRole("textbox", { name: /Heading/ })).toHaveValue(
      DEFAULT_HEADING,
    );
    expect(screen.getByRole("textbox", { name: /Introduction/ })).toHaveValue(
      "Come ride with us.",
    );
    expect(
      screen.getByText("Everything here is published."),
    ).toBeInTheDocument();
    // Nothing had been saved, so there was no draft to ask the server to drop.
    expect(discardMock).not.toHaveBeenCalled();
  });

  test("marks the changed slot in the rail as well as beside the field", async () => {
    renderEditor([editorSlot(HEADING, DEFAULT_HEADING)]);

    await userEvent.type(screen.getByRole("textbox", { name: /Heading/ }), "!");

    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(within(rail).getByText("Unsaved")).toBeInTheDocument();
  });
});

// A photo is a slot like any other since #812: it sits in its section beside
// the copy, previews what the link points at, and clears back to the
// placeholder through the same draft as a sentence does.
describe("image slots", () => {
  /** The preview image, or null while the box is blank or unreadable. */
  function preview(): HTMLImageElement | null {
    return document.querySelector("img");
  }

  test("shows the photo the link points at, and clears it as a draft", async () => {
    renderEditor([editorSlot(CAROUSEL, PHOTO_URL, true)]);

    const box = screen.getByRole("textbox", { name: /Homepage carousel/ });
    expect(box).toHaveValue(PHOTO_URL);
    // The preview is decorative -- it sits against the labelled box holding
    // the link it previews -- so it is found by what it points at (#918).
    expect(preview()).toHaveAttribute("src", PHOTO_URL);
    expect(screen.getByText("Your image")).toBeInTheDocument();

    await userEvent.clear(box);

    expect(preview()).toBeNull();
    expect(screen.getByText("1 change not published yet.")).toBeInTheDocument();

    await userEvent.click(saveBar());
    // Blank is the placeholder icon, which is the slot's default: stored as a
    // null draft so publishing reverts the row rather than saving "".
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith([
        { key: "site_images.home_carousel_1", value: null },
      ]),
    );
  });

  test("Back to default empties the link box", async () => {
    renderEditor([editorSlot(CAROUSEL, PHOTO_URL, true)]);

    await userEvent.click(
      screen.getByRole("button", { name: "Back to default" }),
    );

    expect(
      screen.getByRole("textbox", { name: /Homepage carousel/ }),
    ).toHaveValue("");
  });

  test("a photo that is not set offers nothing to revert", () => {
    renderEditor([editorSlot(CAROUSEL, null)]);

    expect(
      screen.queryByRole("button", { name: "Back to default" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("previews at the aspect the site crops the slot to", () => {
    renderEditor([editorSlot(CAROUSEL, PHOTO_URL, true)]);

    // Not a square: this slide runs as a 21:9 band, and a square thumbnail
    // cannot show whether the picture survives that crop (#918).
    expect(preview()?.parentElement?.style.aspectRatio).toBe("21 / 9");
  });

  test("says once per section what a photo link is and what blank does", () => {
    renderEditor([editorSlot(CAROUSEL, null), editorSlot(HEADING, null)]);

    // One hint for the section, not one under each photo: the same two
    // sentences under all eight image slots on Get Involved was twenty-four
    // lines of identical grey text at 390px (#918).
    expect(screen.getAllByText(/Google Drive share link/)).toHaveLength(1);
    expect(screen.getByText(/placeholder icon/)).toBeInTheDocument();
  });

  test("says so when the link does not load as a picture", async () => {
    renderEditor([editorSlot(CAROUSEL, PHOTO_URL, true)]);

    fireEvent.error(preview()!);

    // A Drive *folder* link is a valid URL that serves HTML, so nothing but
    // the failed load can tell the editor it picked the wrong link (#918).
    expect(screen.getByText(/did not load as a picture/)).toBeInTheDocument();
    expect(preview()).toBeNull();
  });

  test("is found by its label from the search rail", async () => {
    renderEditor([
      editorSlot(HEADING, DEFAULT_HEADING),
      editorSlot(CAROUSEL, null),
    ]);

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search all site content" }),
      "carousel",
    );

    // On the page being edited a hit is a jump, not a navigation.
    const results = screen.getByRole("navigation", { name: "Search results" });
    expect(
      within(results).getByRole("button", { name: /Homepage carousel/ }),
    ).toBeInTheDocument();
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
    expect(screen.getByText("1 change not published yet.")).toBeInTheDocument();
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
  // The platform's document is neutral since #858, so it is a tenant's to copy
  // and edit rather than headings-only prompting for prose nobody has written.
  test("starting from the platform document seeds its headings and its text", async () => {
    renderEditor([editorSlot(PRIVACY, null)]);

    await userEvent.click(
      screen.getByRole("button", { name: "Start from the platform document" }),
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Privacy Policy",
    );
    const headings = screen.getAllByRole("textbox", { name: "Heading" });
    expect((headings[0] as HTMLInputElement).value).toBe(
      "What we collect, and why",
    );
    expect(screen.getAllByRole("textbox", { name: "Text" })[0]).not.toHaveValue(
      "",
    );
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
