import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./helpers/test";
import { modal } from "./helpers/dialog";
import { clickNavLink } from "./helpers/nav";
import {
  completeRegistration,
  continueToReview,
  continueToThisEvent,
  sayNoMinors,
  answerRiding,
} from "./helpers/registration";
import { SEEDED_EVENT_IDS } from "../test/seed-fixtures";

const EVENT_NAME = "Winter Gear Swap";
const EVENT_URL = /\/events\/e\/[0-9a-f-]{36}$/;

/** The listing's card for an event: an anchor to the event's own URL (#847). */
function eventLink(page: Page) {
  return page.getByRole("link", { name: EVENT_NAME });
}

/**
 * Presses the sheet's Register trigger and fills the form it reveals (#1256).
 *
 * The form is behind a disclosure now, so every registration is two steps, and
 * the trigger and the submit are deliberately different words.
 */
async function registerFromSheet(dialog: Locator, name: string, email: string) {
  const trigger = dialog.getByRole("button", { name: "Register", exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByLabel("Name")).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // The revealed form takes focus, so a keyboard user carries on where the
  // fields are rather than at the bottom of a page that silently grew.
  await expect(dialog.getByLabel("Name")).toBeFocused();

  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  // Required since #685, and answered "no" so this helper stays about
  // registering rather than about who is in the party.
  await continueToThisEvent(dialog);
  await sayNoMinors(dialog);
  await answerRiding(dialog);
  await completeRegistration(dialog);
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

    await registerFromSheet(
      dialog,
      "E2E Test Registrant",
      `e2e-${Date.now()}@example.test`,
    );

    await expect(
      dialog.getByText(
        "You're registered! We look forward to seeing you there.",
      ),
    ).toBeVisible();

    // The riding questions were step 2 (#1415), so nothing follows the
    // confirmation but the account offer.
    await expect(dialog.getByText(/Do you ski or ride/)).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Save details" }),
    ).toHaveCount(0);
  });

  // #1413. Three steps at every width, with a summary that goes back to each,
  // and a refusal about a typed field lands on the step that field is on.
  test("registration steps through, reviews, and returns to a refused field", async ({
    page,
  }) => {
    const email = `e2e-steps-${Date.now()}@example.test`;
    await eventLink(page).click();
    const dialog = page.getByRole("dialog", { name: EVENT_NAME });
    await registerFromSheet(dialog, "E2E Steps Registrant", email);
    await expect(dialog.getByText(/You're registered/)).toBeVisible();

    // The same email again, so the RPC refuses it as already registered.
    await page.reload();
    const again = page.locator("main");
    await again.getByRole("button", { name: "Register", exact: true }).click();
    await expect(again.getByLabel(/Phone/)).toHaveCount(0);
    await again.getByLabel("Name").fill("E2E Steps Registrant");
    await again.getByLabel("Email").fill(email);
    await continueToThisEvent(again);
    await sayNoMinors(again);
    await answerRiding(again);
    await again.getByLabel("Notes").fill("Bringing a friend's board");
    await continueToReview(again);

    const review = again.getByRole("group", { name: /Review and agree/ });
    await expect(review.getByText(email)).toBeVisible();
    await expect(review.getByText("Bringing a friend's board")).toBeVisible();
    // The riding answers are summarised with the rest of step 2 (#1415).
    await expect(review.getByText("Snowboard", { exact: true })).toBeVisible();

    await review.getByRole("button", { name: "Edit your riding" }).click();
    const thisEvent = again.getByRole("group", { name: /Your riding/ });
    await expect(thisEvent).toBeFocused();
    await thisEvent.getByLabel("Notes").fill("Bringing my own board");
    await continueToReview(again);
    await expect(review.getByText("Bringing my own board")).toBeVisible();

    await again.getByRole("button", { name: "Complete registration" }).click();
    const aboutYou = again.getByRole("group", { name: /About you/ });
    await expect(
      aboutYou.getByText("This email is already registered for this event."),
    ).toBeVisible();
    await expect(aboutYou.getByLabel("Email")).toHaveValue(email);
  });

  // #1258. The seeded tenant has `constituent_accounts` on (#1175), so a
  // signed-out registrant is offered an account -- and the offer has to carry
  // the registration through sign-up, since a claim made afterwards from a
  // blank form is the retyping this exists to remove.
  test("a signed-out registrant is offered an account that keeps this", async ({
    page,
  }) => {
    await eventLink(page).click();

    const dialog = page.getByRole("dialog", { name: EVENT_NAME });
    await registerFromSheet(
      dialog,
      "E2E Keeping Registrant",
      `e2e-keep-${Date.now()}@example.test`,
    );

    await expect(
      dialog.getByRole("heading", { name: "Keep this" }),
    ).toBeVisible();
    // Nothing about whether a record matched: the offer reads the same either
    // way, and says only what will happen next.
    await expect(
      dialog.getByText(/once we've confirmed who you are/),
    ).toBeVisible();

    await dialog.getByRole("link", { name: "Make an account" }).click();

    await expect(page).toHaveURL(
      /\/my\/sign-in\?next=%2Fmy%2Fregistration%2F[0-9a-f-]{36}$/,
    );
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
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
