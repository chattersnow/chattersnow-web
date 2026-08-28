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
