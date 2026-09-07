import { test, expect } from "./helpers/test";

// Issue #593: the carousel arrows used to flip outside the carousel box at the
// lg breakpoint (1024px), 96px before the viewport was wide enough to hold
// them, so /home scrolled horizontally by exactly 8px between 1024 and ~1120px.
const WIDTHS = [1000, 1024, 1060, 1100, 1140, 1280];

test.describe("home page layout", () => {
  test("does not scroll horizontally at any desktop width", async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      // Resize before navigating, not after. Resizing an already-loaded /home
      // does not reflow the carousel, so a resize-only loop misses the bug
      // entirely -- it passed against the unfixed component.
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/home");
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });

      expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    }
  });
});
