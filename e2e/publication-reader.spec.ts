// Issue #1473: the reader around a publication's pages. Read-only against the
// seeded 26-page `fall-2026` issue (supabase/seed.sql), so it runs beside
// everything else.
import { test, expect } from "./helpers/test";

const ISSUE = "/publications/fall-2026";

test.describe("publication reader", () => {
  test("the counter and the address follow the page being read", async ({
    page,
  }) => {
    await page.goto(ISSUE);
    await page.evaluate(() =>
      document.getElementById("page-6")?.scrollIntoView({ block: "start" }),
    );
    await expect(
      page.locator("p", { hasText: /^Pages? 6(–7)? of 26$/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#page-6$/);
  });

  test("a #page-N link opens on that page", async ({ page }) => {
    await page.goto(`${ISSUE}#page-12`);
    await expect(
      page.locator("p", { hasText: /^Pages? 12(–13)? of 26$/ }),
    ).toBeVisible();
    await expect(page.locator("#page-12")).toBeInViewport();
  });

  test("full screen opens on the tapped page and pages with the keyboard", async ({
    page,
  }) => {
    await page.goto(ISSUE);
    await page.getByRole("button", { name: "View page 3 full screen" }).click();
    const counter = page.locator(".yarl__counter");
    await expect(counter).toHaveText("3 / 26");
    await page.keyboard.press("End");
    await expect(counter).toHaveText("26 / 26");
    await page.keyboard.press("Home");
    await expect(counter).toHaveText("1 / 26");
    await page.keyboard.press("ArrowRight");
    await expect(counter).toHaveText("2 / 26");

    await page.keyboard.press("Escape");
    await expect(counter).toBeHidden();
    await expect(
      page.getByRole("button", { name: "View page 2 full screen" }),
    ).toBeFocused();
  });

  test("wide screens can show facing pages, and remember it", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "phones always get single pages",
    );
    await page.goto(ISSUE);
    await page.getByRole("button", { name: "Spread" }).click();
    await page.evaluate(() =>
      document.getElementById("page-4")?.scrollIntoView({ block: "start" }),
    );
    await expect(
      page.locator("p", { hasText: "Pages 4–5 of 26" }),
    ).toBeVisible();

    const top = async (id: string) =>
      (await page.locator(id).boundingBox())?.y ?? Number.NaN;
    expect(await top("#page-5")).toBeCloseTo(await top("#page-4"), 0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Spread" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
