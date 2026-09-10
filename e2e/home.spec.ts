import type { Page } from "@playwright/test";
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

/**
 * Which slide the track is showing, by the one sitting closest to the
 * viewport's left edge.
 *
 * Embla marks the selected slide nowhere in the DOM -- it moves a transform on
 * the track -- so there is no attribute to assert on, and adding one to the
 * component for the sake of a test would be a production change nothing else
 * needs.
 */
function selectedSlide(page: Page): Promise<number> {
  return page.evaluate(() => {
    const track = document.querySelector("[data-slot=carousel-content]")!;
    const left = track.getBoundingClientRect().left;
    const slides = Array.from(
      document.querySelectorAll("[data-slot=carousel-item]"),
    );
    let selected = 0;
    let closest = Infinity;
    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.getBoundingClientRect().left - left);
      if (distance < closest) {
        closest = distance;
        selected = index;
      }
    });
    return selected;
  });
}

/** One slide's turn, plus enough room for a slow runner to finish the move. */
const A_ROTATION = 9_000;

test.describe("the home carousel", () => {
  test("advances on its own, and stays put once paused", async ({ page }) => {
    await page.goto("/home");

    const first = await selectedSlide(page);
    await expect
      .poll(() => selectedSlide(page), {
        timeout: 20_000,
        message: "the carousel never advanced on its own",
      })
      .not.toBe(first);

    await page.getByRole("button", { name: "Pause the slideshow" }).click();
    // Off the carousel afterwards, which is the case worth testing: the plugin
    // pauses on mouseenter and restarts on mouseleave of its own accord, so a
    // reader who pauses while their pointer is over the image would have it
    // start up again the moment they moved away.
    await page.mouse.move(0, 0);

    const paused = await selectedSlide(page);
    await page.waitForTimeout(A_ROTATION);
    expect(await selectedSlide(page), "it moved after being paused").toBe(
      paused,
    );
    await expect(
      page.getByRole("button", { name: "Play the slideshow" }),
    ).toBeVisible();
  });

  // WCAG 2.2.2 is satisfied by the button above; this is the other half, and
  // the one a reader never has to ask for.
  test.describe("for a reader who prefers reduced motion", () => {
    test("it does not move at all", async ({ page }) => {
      // Emulated on the page rather than through `test.use`: this suite's
      // `test` is extended with its own fixtures, which narrows what `use`
      // accepts, and the media feature has to be in place before the page
      // loads either way.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/home");

      await expect(
        page.getByRole("button", { name: "Play the slideshow" }),
      ).toBeVisible();

      const first = await selectedSlide(page);
      await page.waitForTimeout(A_ROTATION);
      expect(await selectedSlide(page), "it moved without being asked").toBe(
        first,
      );
    });
  });
});
