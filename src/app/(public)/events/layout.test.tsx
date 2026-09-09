import { describe, expect, mock, test } from "bun:test";

// The gate the layout is here for. Standing in for it keeps this a test of the
// layout's own shape -- what it renders, and in which order it decides to --
// rather than of page visibility, which page-visibility.test.ts already covers.
const NOT_VISIBLE = new Error("not found");
let visible = true;

mock.module("@/lib/page-visibility", () => ({
  requireVisiblePage: async () => {
    if (!visible) throw NOT_VISIBLE;
  },
}));

const { default: EventsLayout } = await import("./layout");

/** Renders the layout and collects the slots it returned, in order. */
async function renderSlots() {
  const element = await EventsLayout({
    children: "children-slot",
    modal: "modal-slot",
  });
  return JSON.stringify(element);
}

describe("events layout", () => {
  test("renders the modal slot alongside children", async () => {
    visible = true;
    const rendered = await renderSlots();

    // The intercepted /events/[id] is only ever on screen because the layout
    // renders its slot; drop `modal` and the sheet silently stops opening
    // while every route still resolves (#847).
    expect(rendered).toContain("children-slot");
    expect(rendered).toContain("modal-slot");
  });

  // requireVisiblePage() is awaited before anything renders, so the board
  // hiding Events takes the sheet with it rather than leaving an overlay that
  // works on a section whose pages 404 (#586).
  test("gates the modal slot behind the same visibility check", async () => {
    visible = false;
    await expect(renderSlots()).rejects.toBe(NOT_VISIBLE);
  });
});
