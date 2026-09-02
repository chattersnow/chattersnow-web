import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

const SECTIONS = [
  { path: "/portal/administration", heading: "Users" },
  { path: "/portal/calendar", heading: "Calendar" },
  { path: "/portal/communications", heading: "Messages" },
  { path: "/portal/events", heading: "Events" },
  { path: "/portal/finance", heading: "Expenses" },
  { path: "/portal/governance", heading: "Board Members" },
  { path: "/portal/inventory", heading: "Inventory" },
  { path: "/portal/people", heading: "People" },
  { path: "/portal/programs", heading: "Programs" },
  { path: "/portal/volunteers", heading: "Roles" },
];

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const { path, heading } of SECTIONS) {
  test(`${path} loads and shows "${heading}"`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
  });
}

test("sidebar navigation shows a skeleton, not a blocking overlay", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sidebar links are behind the mobile menu");

  await page.goto("/portal/events");
  await expect(
    page.getByRole("heading", { level: 1, name: "Events", exact: true }),
  ).toBeVisible();

  // Slow the destination's RSC fetch down so the loading boundary is observable.
  await page.route("**/portal/people**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  const peopleLink = page.getByRole("link", { name: "People" });
  await peopleLink.click();

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  // The sidebar must stay visible and interactive while the route loads.
  await expect(page.getByRole("link", { name: "Events" })).toBeVisible();

  await expect(
    page.getByRole("heading", { level: 1, name: "People", exact: true }),
  ).toBeVisible();
});
