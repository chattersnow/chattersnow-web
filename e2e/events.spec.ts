import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { modal } from "./helpers/dialog";
import { clickNavLink } from "./helpers/nav";
import { SEEDED_EVENT_IDS } from "../test/seed-fixtures";

const EVENT_NAME = "Winter Gear Swap";
const EVENT_URL = /\/events\/e\/[0-9a-f-]{36}$/;

/** The listing's card for an event: an anchor to the event's own URL (#847). */
function eventLink(page: Page) {
  return page.getByRole("link", { name: EVENT_NAME });
}

test.describe("public events", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Upcoming events" }),
    ).toBeVisible();
  });

  test("opening an event from the listing gives it a URL", async ({ page }) => {
    await eventLink(page).click();

    const dialog = modal(page);
    await expect(
      dialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();
    // The sheet is the intercepted /events/e/[id], so the event is shareable
    // from the moment it opens -- and the listing is still underneath it,
    // which is why Back lands there without a fetch. Read by tag rather than
    // by role: an open modal makes the rest of the page inert, so the listing
    // is deliberately out of the accessibility tree while the sheet is up.
    await expect(page).toHaveURL(EVENT_URL);
    await expect(
      page.locator("h2", { hasText: "Upcoming events" }),
    ).toBeVisible();
  });

  test("Back closes the sheet and Forward reopens it", async ({ page }) => {
    await eventLink(page).click();
    await expect(modal(page)).toBeVisible();

    await page.goBack();
    await expect(modal(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/events$/);

    await page.goForward();
    await expect(
      modal(page).getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();
    await expect(page).toHaveURL(EVENT_URL);
  });

  test("a shared link renders the event's page, not the sheet", async ({
    page,
  }) => {
    await page.goto(`/events/e/${SEEDED_EVENT_IDS.upcoming}`);

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  // Events lived at /events/<uuid> until the sheet forced them a segment down,
  // and that URL went out in confirmation emails and was pasted into bios, so
  // it has to keep working rather than 404.
  test("the URL events used to live at still reaches them", async ({
    page,
  }) => {
    await page.goto(`/events/${SEEDED_EVENT_IDS.upcoming}`);

    await expect(page).toHaveURL(EVENT_URL);
    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
  });

  test("reloading the sheet's URL renders the page", async ({ page }) => {
    await eventLink(page).click();
    await expect(modal(page)).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
  });

  // The navigation that was broken in production. While events sat at
  // /events/[id], `@modal/(.)[id]` matched every single segment under /events
  // -- ahead of both `[...catchAll]` and the children slot's own static
  // `community/page.tsx` -- so this click ran the sheet with id="community",
  // found no such event and `notFound()`, which bubbles to the /events layout
  // and buries both slots under the not-found page. Moving events down to
  // /events/e/[id] is what separates them (see events/event-path.ts).
  //
  // It only bit on a client-side navigation that started inside /events, so a
  // hard load and a link from anywhere else were always fine -- which is why
  // nothing caught it before release, and why this test has to click rather
  // than `goto`.
  //
  // Through `clickNavLink` rather than the desktop trigger directly, because
  // the mobile project has no such button -- the grouped links are flat inside
  // the off-canvas sheet -- and a visitor on a phone hit this exactly as hard.
  test("the nav reaches the community calendar from the listing", async ({
    page,
  }) => {
    await clickNavLink(page, "Community Calendar", { group: "Events" });

    await expect(page).toHaveURL(/\/events\/community$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Community Calendar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toHaveCount(0);
    // The sheet must stay shut rather than open empty over the calendar.
    await expect(modal(page)).toHaveCount(0);
  });

  test("submitting an event registration from the sheet", async ({ page }) => {
    await eventLink(page).click();

    const dialog = page.getByRole("dialog", { name: EVENT_NAME });
    await expect(
      dialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();

    const uniqueEmail = `e2e-${Date.now()}@example.test`;
    await dialog.getByLabel("Name").fill("E2E Test Registrant");
    await dialog.getByLabel("Email").fill(uniqueEmail);
    await dialog.getByRole("button", { name: "Register" }).click();

    await expect(
      dialog.getByText(
        "You're registered! We look forward to seeing you there.",
      ),
    ).toBeVisible();

    // The rider-profile prompt continues from the confirmation (#564).
    await dialog.getByRole("combobox", { name: "Do you ski or ride?" }).click();
    await page.getByRole("option", { name: "Both" }).click();

    await dialog.getByRole("combobox", { name: "Experience on skis" }).click();
    await page.getByRole("option", { name: "Beginner" }).click();

    await dialog
      .getByRole("combobox", { name: "Experience on a snowboard" })
      .click();
    await page.getByRole("option", { name: "Advanced" }).click();

    await dialog
      .getByRole("combobox", { name: "Preferred mountain for meetups" })
      .click();
    await page.getByRole("option", { name: "Hunter" }).click();

    await dialog.getByRole("button", { name: "Save details" }).click();

    await expect(
      dialog.getByText(
        "Thanks — we'll use this to point you at the right group.",
      ),
    ).toBeVisible();
  });

  test("skipping the rider profile leaves the registration confirmed", async ({
    page,
  }) => {
    await eventLink(page).click();

    const dialog = page.getByRole("dialog", { name: EVENT_NAME });
    await expect(
      dialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();

    const uniqueEmail = `e2e-skip-${Date.now()}@example.test`;
    await dialog.getByLabel("Name").fill("E2E Skipping Registrant");
    await dialog.getByLabel("Email").fill(uniqueEmail);
    await dialog.getByRole("button", { name: "Register" }).click();

    const confirmation = dialog.getByText(
      "You're registered! We look forward to seeing you there.",
    );
    await expect(confirmation).toBeVisible();

    await dialog.getByRole("button", { name: "Skip" }).click();

    // The prompt goes away; the registration stands.
    await expect(
      dialog.getByRole("button", { name: "Save details" }),
    ).toBeHidden();
    await expect(confirmation).toBeVisible();
  });
});

// Interception is scoped to the /events layout on purpose: an event followed
// from anywhere else is a full navigation to its page, not a sheet over
// whatever page the visitor was on. Moving the slot up to the (public) layout
// would change that silently, which is what this covers (#847).
test.describe("events linked from outside the listing", () => {
  test("a card on the home page navigates to the event's own page", async ({
    page,
  }) => {
    await page.goto("/home");

    await page
      .getByRole("link", { name: new RegExp(EVENT_NAME, "i") })
      .first()
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(page).toHaveURL(EVENT_URL);
    await expect(modal(page)).toHaveCount(0);
  });
});
