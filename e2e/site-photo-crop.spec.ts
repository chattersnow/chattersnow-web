// Issue #1251: a site photo is framed in the portal by moving the picture
// inside the shape the public page crops it to, and the rect that comes out
// rides on the photo's own URL as a `#crop=` fragment (#1250).
//
// Two things can only be checked in a real browser. The drag is one: happy-dom
// reports an all-zero `getBoundingClientRect()` and a `naturalWidth` of 0, so
// the pointer maths has no numbers to work with there and the unit tests drive
// the sliders instead. The other is that the crop survives the whole trip --
// editor to draft to publish to the page a visitor loads.
//
// It writes a published `site_images.about_team_hero_photo` for the length of
// the run, which every other spec reading /about/team would see, so it lives in
// the `mutating` project -- see playwright.config.ts.
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

const SLOT = "site_images.about_team_hero_photo";

/**
 * A photo from this project's own `public/` folder.
 *
 * The public page draws a site photo through the image optimizer, which
 * refuses a host `next.config.ts` does not list, and the seed has no Drive
 * link to borrow. A root-relative path needs no pattern at all.
 */
const PHOTO = "/chatter-logo-transparent.png";

const SLOT_LABEL = "Meet the Team — top photo";

/**
 * This slot's paste box.
 *
 * Scoped to the slot's own field rather than found by name across the page:
 * since #921 the slot's label belongs to its upload control and the box is
 * labelled "Or paste a link", which every image slot on this page now carries.
 * The id holds a dot, so it is matched as an attribute rather than as a CSS id.
 */
function linkBox(page: Page): Locator {
  return page
    .locator(`[id="field-${SLOT}"]`)
    .getByRole("textbox", { name: "Or paste a link" });
}

async function seedPhoto(url: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("site_content")
    .upsert(
      { key: SLOT, value: url, published_at: new Date().toISOString() },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw new Error(`Could not seed ${SLOT}: ${error.message}`);
}

async function clearPhoto() {
  const admin = createAdminClient();
  // Deleted rather than blanked: the seed writes no row for this slot, so an
  // absent row is what "before" means and what the rest of the suite expects.
  const { error } = await admin.from("site_content").delete().eq("key", SLOT);
  if (error) throw new Error(`Could not clear ${SLOT}: ${error.message}`);
}

/** What the slot holds now, fragment and all. */
async function storedValue(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_content")
    .select("value")
    .eq("key", SLOT)
    .maybeSingle();
  if (error) throw new Error(`Could not read ${SLOT}: ${error.message}`);
  return typeof data?.value === "string" ? data.value : null;
}

/** Drags the picture inside its frame, the way an editor frames a face. */
async function dragPicture(page: Page, frame: Locator, dx: number, dy: number) {
  const box = await frame.boundingBox();
  if (!box) throw new Error("The crop frame has no box to drag.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // In steps, because one jump can be delivered as a single pointermove that
  // the browser coalesces away entirely.
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe("framing a site photo", () => {
  // One published `site_content` row shared by the whole site, so the cases
  // here would otherwise race each other's assertions as well as the suite's.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await seedPhoto(PHOTO);
  });

  test.afterAll(async () => {
    await clearPhoto();
  });

  test("a crop set by dragging reaches the public page", async ({ page }) => {
    await seedPhoto(PHOTO);
    await signIn(page);
    await page.goto("/portal/website?page=about_team");

    const group = page.getByRole("group", { name: `Crop of ${SLOT_LABEL}` });
    await expect(group).toBeVisible();

    // The link box shows the photo, never the rect: the fragment is the one
    // cost of this encoding and it must not reach a person as text.
    const link = linkBox(page);
    await expect(link).toHaveValue(PHOTO);

    // Zoom in first, from the keyboard, which is the whole reason the control
    // is three range inputs rather than a drag surface. It also gives both
    // axes somewhere to go: at zoom 1 one of them never has any slack.
    const zoom = group.getByRole("slider", { name: "Zoom" });
    await zoom.focus();
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(zoom).toHaveAttribute("aria-valuetext", "1.2×");

    await dragPicture(page, group.locator("img"), -40, -25);

    // Still the photo and not the rect, after everything above.
    await expect(link).toHaveValue(PHOTO);

    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    // The dialog draws both sides at their own crop, or a change that moves
    // the crop and nothing else shows two identical pictures (#1251).
    const dialog = modal(page);
    const sides = dialog.locator("img");
    await expect(sides).toHaveCount(2);
    await expect(sides.nth(0).locator("xpath=..")).not.toHaveAttribute(
      "style",
      /width/,
    );
    await expect(sides.nth(1).locator("xpath=..")).toHaveAttribute(
      "style",
      /width:/,
    );

    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(storedValue, { message: "the crop reached the published slot" })
      .toMatch(/^\/chatter-logo-transparent\.png#crop=[\d.,]+$/);

    // Reloaded, the editor reads the stored string back as the same control:
    // a crop to move, and a link box with no fragment in it.
    await page.reload();
    await expect(
      page.getByRole("group", { name: `Crop of ${SLOT_LABEL}` }),
    ).toBeVisible();
    await expect(linkBox(page)).toHaveValue(PHOTO);
    await expect(
      page.getByRole("button", { name: "Reset crop" }),
    ).toBeEnabled();

    // And the page a visitor loads moved with it: a cropped photo is laid out
    // in a box scaled past the frame, which an uncropped one has no need of.
    await page.goto("/about/team");
    const hero = page.locator('img[src*="chatter-logo-transparent"]').first();
    await expect(hero).toBeVisible();
    await expect(hero.locator("xpath=..")).toHaveAttribute(
      "style",
      /width:\s*1\d\d(\.\d+)?%/,
    );
  });

  test("resetting puts the whole picture back, here and on the site", async ({
    page,
  }) => {
    await seedPhoto(`${PHOTO}#crop=0.1000,0.2000,0.5000,0.2143`);
    await signIn(page);
    await page.goto("/portal/website?page=about_team");

    await page.getByRole("button", { name: "Reset crop" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await modal(page).getByRole("button", { name: "Publish" }).click();

    // The bare link, not an identity rect: "never cropped" and "reset" have to
    // be the same string, or the slot reads as edited for ever after.
    await expect.poll(storedValue).toBe(PHOTO);

    await page.goto("/about/team");
    const hero = page.locator('img[src*="chatter-logo-transparent"]').first();
    await expect(hero).toBeVisible();
    await expect(hero.locator("xpath=..")).not.toHaveAttribute(
      "style",
      /width/,
    );
  });
});
