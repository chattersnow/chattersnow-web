import { test, expect } from "@playwright/test";

// These notices have to be reachable from anywhere on the site, which is why
// they live in the footer's legal bar rather than the header nav. They sit in
// their own "Legal" landmark, separate from the "Footer" one carrying the
// section links -- a utility link is not a site section.
const LEGAL_PAGES = [
  { name: "Privacy Policy", path: "/privacy" },
  { name: "Terms of Use", path: "/terms" },
  { name: "Code of Conduct", path: "/code-of-conduct" },
];

test.describe("legal pages", () => {
  for (const { name, path } of LEGAL_PAGES) {
    test(`${name} page loads`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByText("Last updated:")).toBeVisible();
    });

    test(`the footer links to ${name} from a public page`, async ({ page }) => {
      await page.goto("/home");

      await page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name })
        .click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    });
  }
});
