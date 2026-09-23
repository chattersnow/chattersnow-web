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

async function render() {
  const element = await EventsLayout({ children: "children-slot" });
  return JSON.stringify(element);
}

describe("events layout", () => {
  test("renders its children", async () => {
    visible = true;
    expect(await render()).toContain("children-slot");
  });

  // requireVisiblePage() is awaited before anything renders, so the board
  // hiding Events 404s the listing and every event page (#586).
  test("gates them behind the visibility check", async () => {
    visible = false;
    await expect(render()).rejects.toBe(NOT_VISIBLE);
  });
});
