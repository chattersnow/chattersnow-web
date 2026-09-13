// Issues #917 and #1012: Meet the Team can be a card grid, full-width roster
// rows, or a grid of portraits with one bio at a time.
// Which one is a single `layout.team_layout` row shared by the whole site, and
// the seeded tenant's team member has an 18-character bio with nothing to
// clip, so this file also writes a long-bio member into `site_content` for the
// length of the run. Both are global state, so it mutates what every other
// spec reading /about/team would see and lives in the `mutating` project --
// see playwright.config.ts.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

/** Five paragraphs, ~1,200 characters: the length the ticket was opened about. */
const LONG_BIO = [
  "I have been riding for four years and I learned as an adult, which is hard work that I enjoy every second of.",
  "This organization came out of frustration with what kept turning up under mountain pride posts, and what I heard on the hill.",
  "When I am not putting on events you can usually find me volunteering on snow with a few other groups around the region.",
  "Off snow I play saxophone, surf, draw, climb, and read comics, and I have made friends here who share all of that with me.",
  "If you are reading this and are not sure where to start, just show up to an event. You will not leave without a new friend.",
];

const LAST_PARAGRAPH = LONG_BIO[4];

const MEMBERS = [
  {
    name: "Long Bio Member",
    role: "Programs lead",
    photo_url: "",
    photo_slot: "",
    bio: LONG_BIO,
  },
  // The live shape a bio-less member has: an empty list, not a missing key.
  { name: "No Bio Member", role: "Board chair", bio: [] },
];

async function setLayout(layout: "cards" | "rows" | "portraits") {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key: "layout.team_layout", value: layout },
      { onConflict: "tenant_id,key" },
    );
  if (error) {
    throw new Error(`Could not set layout.team_layout: ${error.message}`);
  }
}

async function seedMembers() {
  const admin = createAdminClient();
  const { error } = await admin.from("site_content").upsert(
    {
      key: "about_team.members",
      value: MEMBERS,
      published_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) {
    throw new Error(`Could not seed about_team.members: ${error.message}`);
  }
}

async function clearMembers() {
  const admin = createAdminClient();
  // Deleted rather than reset to a value: the seed writes no
  // `about_team.members` row at all, so the registry default is what "before"
  // means here.
  const { error } = await admin
    .from("site_content")
    .delete()
    .eq("key", "about_team.members");
  if (error) {
    throw new Error(`Could not clear about_team.members: ${error.message}`);
  }
}

test.describe("how Meet the Team is arranged", () => {
  // One site-wide setting and one site-wide content row, so a case's cleanup
  // would otherwise race another's assertions. Same reasoning as
  // programs-source.spec.ts.
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await seedMembers();
  });

  test.afterAll(async () => {
    await setLayout("cards");
    await clearMembers();
  });

  test.afterEach(async () => {
    await setLayout("cards");
  });

  test("cards are the default, and hold every bio in full", async ({
    page,
  }) => {
    await setLayout("cards");
    await page.goto("/about/team");

    await expect(
      page.getByRole("heading", { level: 1, name: "Meet the team" }),
    ).toBeVisible();
    await expect(page.getByText(LAST_PARAGRAPH)).toBeVisible();
    // No expander in the grid: a card is a column, and clipping is the rows
    // layout's answer to a column that is too narrow for the words in it.
    await expect(page.getByRole("button", { name: /Read more/ })).toHaveCount(
      0,
    );
    // The bio-less member keeps the placeholder here.
    await expect(page.getByText("Bio coming soon.")).toBeVisible();
  });

  test("roles render in both layouts", async ({ page }) => {
    await setLayout("cards");
    await page.goto("/about/team");
    await expect(page.getByText("Programs lead")).toBeVisible();

    await setLayout("rows");
    await page.goto("/about/team");
    await expect(page.getByText("Programs lead")).toBeVisible();
    await expect(page.getByText("Board chair")).toBeVisible();
  });

  test("rows clip a long bio and expand it in place", async ({ page }) => {
    await setLayout("rows");
    await page.goto("/about/team");

    // Present before the click, not fetched by it: the clip is CSS over
    // markup the server already sent, which is what keeps the whole bio
    // available to a crawler and to a reader without JavaScript.
    await expect(page.getByText(LAST_PARAGRAPH)).toHaveCount(1);

    // `not.toBeVisible()` is the wrong question to ask of a clipped element,
    // and asking it was a bug in this spec rather than in the page: the bio is
    // clipped with `overflow: hidden`, so its last paragraph still has a box
    // and Playwright rightly calls it visible. That is the whole point -- the
    // words are on the page in both states. What actually changes is whether
    // the container is clipping, so that is what to measure.
    const bio = page.locator(".team-bio-clamped");
    await expect(bio).toHaveCount(1);
    expect(await bio.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );

    const readMore = page.getByRole("button", { name: /Read more/ });
    await expect(readMore).toBeVisible();
    await readMore.click();

    await expect(page.locator(".team-bio-clamped")).toHaveCount(0);
    await expect(page.getByText(LAST_PARAGRAPH)).toBeVisible();
    await expect(page.getByRole("button", { name: /Show less/ })).toBeVisible();
  });

  test("the expander works from the keyboard", async ({ page }) => {
    await setLayout("rows");
    await page.goto("/about/team");

    const readMore = page.getByRole("button", { name: /Read more/ });
    await readMore.focus();
    await expect(readMore).toBeFocused();
    await expect(page.locator(".team-bio-clamped")).toHaveCount(1);
    await page.keyboard.press("Enter");

    // The clip coming off is the assertion. The paragraph is on the page
    // either way, so its visibility would pass whether or not Enter did
    // anything at all.
    await expect(page.locator(".team-bio-clamped")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Show less/ })).toBeFocused();
  });

  test("portraits show every face and no bio until one is picked", async ({
    page,
  }) => {
    await setLayout("portraits");
    await page.goto("/about/team");

    await expect(page.getByText("Long Bio Member").first()).toBeVisible();
    await expect(page.getByText("No Bio Member").first()).toBeVisible();

    // In the markup, so a crawler and a reader without JavaScript have it,
    // but not on screen: this layout opens as a page of faces.
    await expect(page.getByText(LAST_PARAGRAPH)).toHaveCount(1);
    await expect(page.getByText(LAST_PARAGRAPH)).not.toBeVisible();

    // Only the member who has a bio is a control.
    const portrait = page.getByRole("button", { name: /Long Bio Member/ });
    await expect(portrait).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("button", { name: /No Bio Member/ }),
    ).toHaveCount(0);

    await portrait.click();

    await expect(page.getByText(LAST_PARAGRAPH)).toBeVisible();
    await expect(portrait).toHaveAttribute("aria-expanded", "true");

    // And closes again, leaving no panel behind.
    await portrait.click();
    await expect(page.getByText(LAST_PARAGRAPH)).not.toBeVisible();
  });

  test("a member with no bio gets no expander and no placeholder", async ({
    page,
  }) => {
    await setLayout("rows");
    await page.goto("/about/team");

    await expect(page.getByText("No Bio Member")).toBeVisible();
    await expect(page.getByText("Bio coming soon.")).toHaveCount(0);
    // One member has a long bio, so exactly one expander on the page.
    await expect(page.getByRole("button", { name: /Read more/ })).toHaveCount(
      1,
    );
  });
});
